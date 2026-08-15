import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { defineTool } from '@deepseek-ai/dsh-tools'

const name = 'imagegen'
const inject = ['tools', 'systemPrompt']

const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']
const IMAGE_SIZES = ['1K', '2K', '4K']
const IMAGE2_SIZES = ['1024x1024', '1024x1536', '1536x1024', 'auto']
const IMAGE2_QUALITIES = ['low', 'medium', 'high', 'auto']
const PROTOCOLS = ['auto', 'gemini', 'image2']
const SETTINGS_NAMESPACE = settingsNamespace('imagegen')

const Config = z.object({
  protocol: z.union(PROTOCOLS).default('image2').description('Image API protocol.'),
  url: z.string().default('').description('API base URL or complete generation endpoint.'),
  apiKey: z.string().role('secret').description('API credential. Leave empty to use apiKeyEnv.'),
  apiKeyEnv: z.string().default('IMAGEGEN_API_KEY').description('Fallback environment variable containing the API credential.'),
  apiKeyHeader: z.string().description('Optional credential header override.'),
  apiKeyPrefix: z.string().description('Optional credential prefix override.'),
  defaultModel: z.string().default('gpt-image-2').description('Default image generation model.'),
  defaultQuality: z.union(IMAGE2_QUALITIES).default('medium').description('Default image2 quality.'),
  outputDirectory: z.string().default('generated-images').description('Workspace-relative default output directory.'),
  timeoutMs: z.number().min(1).default(180000).hidden(),
  maxImageBytes: z.number().min(1).default(20 * 1024 * 1024).hidden(),
  runtimeConfigPath: z.string().default('~/.dsh/dsh-imagegen.json').hidden(),
})

const MIME_EXTENSIONS = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
])

function requireNonBlank(label, value) {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} must be a non-empty string`)
  return trimmed
}

function expandHome(filePath) {
  const value = requireNonBlank('runtimeConfigPath', filePath)
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return resolve(homedir(), value.slice(2))
  return resolve(value)
}

function sessionCwd(exec) {
  const cwd = exec.agent?.session?.header?.cwd
  return typeof cwd === 'string' && isAbsolute(cwd) ? cwd : process.cwd()
}

function safeOutputPath(cwd, requestedPath, outputDirectory, extension) {
  const fallback = `${outputDirectory}/image-${Date.now()}${extension}`
  const input = requestedPath === undefined ? fallback : requireNonBlank('output_path', requestedPath)
  if (isAbsolute(input)) throw new Error('output_path must be relative to the session workspace')

  let target = resolve(cwd, input)
  const rel = relative(cwd, target)
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new Error('output_path must stay inside the session workspace')
  }
  if (!extname(target)) target += extension
  return target
}

function decodeImage(data, maxImageBytes) {
  if (typeof data !== 'string' || data.length === 0) throw new Error('Image API returned empty image data')
  const estimatedBytes = Math.floor(data.length * 3 / 4)
  if (estimatedBytes > maxImageBytes) throw new Error(`Generated image exceeds maxImageBytes (${maxImageBytes})`)
  const bytes = Buffer.from(data, 'base64')
  if (bytes.byteLength === 0 || bytes.byteLength > maxImageBytes) {
    throw new Error(`Generated image exceeds maxImageBytes (${maxImageBytes})`)
  }
  return bytes
}

function extensionFromMime(mimeType) {
  const normalized = mimeType.split(';', 1)[0].trim().toLowerCase()
  const extension = MIME_EXTENSIONS.get(normalized)
  if (!extension) throw new Error(`Image API returned unsupported image MIME type: ${mimeType}`)
  return { mimeType: normalized, extension }
}

function extractGeminiResponse(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) throw new Error('Gemini image API returned no candidate content')

  const text = parts
    .filter((part) => typeof part?.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim()

  for (const part of parts) {
    const inline = part?.inlineData ?? part?.inline_data
    if (inline && typeof inline.data === 'string') {
      const mimeType = inline.mimeType ?? inline.mime_type
      if (typeof mimeType !== 'string') throw new Error('Gemini image API returned no image MIME type')
      return { kind: 'base64', data: inline.data, mimeType, text }
    }
  }
  throw new Error('Gemini image API response did not contain an image')
}

function extractImage2Response(payload) {
  const item = Array.isArray(payload?.data) ? payload.data[0] : undefined
  if (!item || typeof item !== 'object') throw new Error('image2 API response did not contain an image')
  const text = typeof item.revised_prompt === 'string' ? item.revised_prompt.trim() : ''
  if (typeof item.b64_json === 'string' && item.b64_json.length > 0) {
    return { kind: 'base64', data: item.b64_json, mimeType: 'image/png', text }
  }
  if (typeof item.url === 'string' && item.url.length > 0) {
    return { kind: 'url', url: item.url, text }
  }
  throw new Error('image2 API response contained neither b64_json nor url')
}

async function parseError(response) {
  const raw = await response.text()
  try {
    const payload = JSON.parse(raw)
    const message = payload?.error?.message ?? payload?.message
    if (typeof message === 'string' && message.length > 0) return message
  } catch {}
  return raw.slice(0, 500) || response.statusText
}

function parseRuntimeConfig(value, configPath) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Image runtime config must be a JSON object: ${configPath}`)
  }

  const urlTemplate = requireNonBlank('url', value.url)
  const defaultModel = requireNonBlank('defaultModel', value.defaultModel)
  const protocol = value.protocol === undefined ? 'auto' : requireNonBlank('protocol', value.protocol).toLowerCase()
  if (!PROTOCOLS.includes(protocol)) throw new Error(`protocol must be one of: ${PROTOCOLS.join(', ')}`)
  const apiKeyHeader = typeof value.apiKeyHeader === 'string' && value.apiKeyHeader.trim()
    ? value.apiKeyHeader.trim()
    : undefined
  const apiKeyPrefix = typeof value.apiKeyPrefix === 'string' && value.apiKeyPrefix.length > 0
    ? value.apiKeyPrefix
    : undefined
  const defaultQuality = value.defaultQuality === undefined ? 'medium' : requireNonBlank('defaultQuality', value.defaultQuality)
  if (!IMAGE2_QUALITIES.includes(defaultQuality)) throw new Error(`defaultQuality must be one of: ${IMAGE2_QUALITIES.join(', ')}`)

  let apiKey
  if (typeof value.apiKey === 'string' && value.apiKey.trim()) {
    apiKey = value.apiKey.trim()
  } else if (typeof value.apiKeyEnv === 'string' && value.apiKeyEnv.trim()) {
    const envName = value.apiKeyEnv.trim()
    apiKey = process.env[envName]
    if (!apiKey) throw new Error(`Missing image API credential in environment variable ${envName}`)
  } else {
    throw new Error(`Image runtime config requires apiKey or apiKeyEnv: ${configPath}`)
  }

  return { urlTemplate, apiKey, apiKeyHeader, apiKeyPrefix, defaultModel, defaultQuality, protocol }
}

function credentialHeader(runtime, protocol) {
  const header = runtime.apiKeyHeader ?? (protocol === 'image2' ? 'Authorization' : 'x-goog-api-key')
  const prefix = runtime.apiKeyPrefix ?? (header.toLowerCase() === 'authorization' ? 'Bearer ' : '')
  return { header, value: `${prefix}${runtime.apiKey}` }
}

function validateSettings(value) {
  if (typeof value.url !== 'string') throw new Error('url must be a string')
  const url = value.url.trim()
  if (url) {
    let parsed
    try {
      parsed = new URL(url.replaceAll('{model}', 'model'))
    } catch {
      throw new Error('url must be an absolute HTTP(S) URL')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('url must use HTTP or HTTPS')
  }
  requireNonBlank('defaultModel', value.defaultModel)
  const outputDirectory = requireNonBlank('outputDirectory', value.outputDirectory)
  if (isAbsolute(outputDirectory)) throw new Error('outputDirectory must be relative to the session workspace')
  const outputRel = relative(process.cwd(), resolve(process.cwd(), outputDirectory))
  if (outputRel === '..' || outputRel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(outputRel)) {
    throw new Error('outputDirectory must stay inside the session workspace')
  }
  if (!Number.isInteger(value.timeoutMs) || value.timeoutMs < 1) throw new Error('timeoutMs must be a positive integer')
  if (!Number.isInteger(value.maxImageBytes) || value.maxImageBytes < 1) throw new Error('maxImageBytes must be a positive integer')
}

async function loadRuntimeConfig(configPath, signal) {
  let raw
  try {
    raw = await readFile(configPath, { encoding: 'utf8', signal })
  } catch (error) {
    throw new Error(`Cannot read image runtime config ${configPath}: ${error.message}`)
  }

  try {
    return parseRuntimeConfig(JSON.parse(raw), configPath)
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in image runtime config ${configPath}: ${error.message}`)
    throw error
  }
}

async function resolveRuntimeConfig(settings, configPath, signal) {
  try {
    return parseRuntimeConfig(settings, 'imagegen plugin settings')
  } catch (error) {
    if (!/(?:requires apiKey or apiKeyEnv|Missing image API credential)/.test(error.message)) throw error
    return loadRuntimeConfig(configPath, signal)
  }
}

function resolveProtocol(configuredProtocol, urlTemplate, model) {
  if (configuredProtocol !== 'auto') return configuredProtocol
  if (/\/images\/generations(?:[/?#]|$)/i.test(urlTemplate)) return 'image2'
  if (/^gpt-image(?:-|$)/i.test(model) || /^image2(?:-|$)/i.test(model)) return 'image2'
  return 'gemini'
}

function resolveEndpoint(urlTemplate, model, protocol = 'gemini') {
  const encodedModel = encodeURIComponent(model)
  const replaced = urlTemplate.includes('{model}')
    ? urlTemplate.replaceAll('{model}', encodedModel)
    : urlTemplate
  let endpoint
  try {
    endpoint = new URL(replaced)
  } catch {
    throw new Error('url in image runtime config must be an absolute HTTP(S) URL')
  }
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    throw new Error('url in image runtime config must use HTTP or HTTPS')
  }

  if (protocol === 'image2') {
    if (!/\/images\/generations\/?$/i.test(endpoint.pathname)) {
      endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/images/generations`
    }
  } else if (!urlTemplate.includes('{model}') && !endpoint.pathname.endsWith(':generateContent')) {
    endpoint.pathname = endpoint.pathname.replace(/\/v1\/?$/, '/')
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/v1beta/models/${encodedModel}:generateContent`
  }
  return endpoint.href
}

function image2Size(args) {
  if (args.size !== undefined) return args.size
  if (args.aspect_ratio === '9:16' || args.aspect_ratio === '2:3' || args.aspect_ratio === '3:4' || args.aspect_ratio === '4:5') return '1024x1536'
  if (args.aspect_ratio === '16:9' || args.aspect_ratio === '3:2' || args.aspect_ratio === '4:3' || args.aspect_ratio === '5:4' || args.aspect_ratio === '21:9') return '1536x1024'
  return '1024x1024'
}

async function materializeImage(image, maxImageBytes, signal) {
  if (image.kind === 'base64') {
    const { mimeType, extension } = extensionFromMime(image.mimeType)
    return { bytes: decodeImage(image.data, maxImageBytes), mimeType, extension }
  }

  let url
  try {
    url = new URL(image.url)
  } catch {
    throw new Error('image2 API returned an invalid image URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('image2 API returned a non-HTTP(S) image URL')
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Cannot download generated image (${response.status}): ${await parseError(response)}`)
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxImageBytes) {
    throw new Error(`Generated image exceeds maxImageBytes (${maxImageBytes})`)
  }
  const mimeHeader = response.headers.get('content-type') ?? 'image/png'
  const { mimeType, extension } = extensionFromMime(mimeHeader)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > maxImageBytes) {
    throw new Error(`Generated image exceeds maxImageBytes (${maxImageBytes})`)
  }
  return { bytes, mimeType, extension }
}

function apply(ctx, config) {
  validateSettings(config)
  let current = () => config
  installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: () => {},
    validate: validateSettings,
  })

  ctx.systemPrompt.section({
    name: 'tool:image_generate',
    order: 112,
    text: 'Use image_generate when the user asks you to create or generate an image. It reads the imagegen plugin settings for every call and supports Gemini generateContent plus image2/OpenAI Images APIs. Write the generated file into the current session workspace and report its path. Never expose image API credentials.',
  })

  ctx.tools.register(defineTool({
    name: 'image_generate',
    description: 'Generate an image using the locally configured Gemini or image2/OpenAI-compatible API and save it in the current session workspace.',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'Detailed image generation prompt.',
      },
      model: {
        type: 'string',
        description: 'Optional model override. Otherwise uses defaultModel from the runtime config file.',
      },
      aspect_ratio: {
        type: 'string',
        enum: ASPECT_RATIOS,
        description: 'Optional aspect ratio. For image2 it maps to the closest supported size unless size is supplied.',
      },
      image_size: {
        type: 'string',
        enum: IMAGE_SIZES,
        description: 'Optional Gemini output resolution tier.',
      },
      size: {
        type: 'string',
        enum: IMAGE2_SIZES,
        description: 'Optional image2/OpenAI Images size.',
      },
      quality: {
        type: 'string',
        enum: IMAGE2_QUALITIES,
        description: 'Optional image2/OpenAI Images quality.',
      },
      output_path: {
        type: 'string',
        description: 'Optional workspace-relative output path. Defaults under the configured output directory.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          file_url: { type: 'string', required: true },
          mime_type: { type: 'string', required: true },
          bytes: { type: 'integer', required: true },
          model: { type: 'string', required: true },
          protocol: { type: 'string', required: true },
          text: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `Generated image: ${value.path}`,
          `MIME: ${value.mime_type}`,
          `Bytes: ${value.bytes}`,
          `Model: ${value.model}`,
          `Protocol: ${value.protocol}`,
          ...(value.text ? [`Model text: ${value.text}`] : []),
        ].join('\n'),
      }],
    },
    timeoutMs: config.timeoutMs,
    async execute(args, exec) {
      const active = current()
      const runtimeConfigPath = expandHome(active.runtimeConfigPath)
      const runtime = await resolveRuntimeConfig(active, runtimeConfigPath, exec.signal)
      const prompt = requireNonBlank('prompt', args.prompt)
      const model = args.model === undefined ? runtime.defaultModel : requireNonBlank('model', args.model)
      const protocol = resolveProtocol(runtime.protocol, runtime.urlTemplate, model)
      const endpoint = resolveEndpoint(runtime.urlTemplate, model, protocol)
      const credential = credentialHeader(runtime, protocol)
      const headers = {
        'content-type': 'application/json',
        [credential.header]: credential.value,
      }

      let body
      if (protocol === 'image2') {
        body = {
          model,
          prompt,
          n: 1,
          size: image2Size(args),
          quality: args.quality ?? runtime.defaultQuality,
          response_format: 'b64_json',
        }
      } else {
        const imageConfig = {
          ...(args.aspect_ratio === undefined ? {} : { aspectRatio: args.aspect_ratio }),
          ...(args.image_size === undefined ? {} : { imageSize: args.image_size }),
        }
        body = {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            ...(Object.keys(imageConfig).length === 0 ? {} : { imageConfig }),
          },
        }
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: exec.signal,
      })
      if (!response.ok) throw new Error(`Image API request failed (${response.status}): ${await parseError(response)}`)

      const payload = await response.json()
      const image = protocol === 'image2' ? extractImage2Response(payload) : extractGeminiResponse(payload)
      const materialized = await materializeImage(image, active.maxImageBytes, exec.signal)
      const cwd = sessionCwd(exec)
      const outputDirectory = requireNonBlank('outputDirectory', active.outputDirectory)
      const outputPath = safeOutputPath(cwd, args.output_path, outputDirectory, materialized.extension)
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, materialized.bytes, { signal: exec.signal })

      return {
        path: outputPath,
        file_url: pathToFileURL(outputPath).href,
        mime_type: materialized.mimeType,
        bytes: materialized.bytes.byteLength,
        model,
        protocol,
        ...(image.text ? { text: image.text } : {}),
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Generate image',
      kind: 'execute',
      rawInput: args.prompt,
    }),
  }))
}

export {
  Config,
  SETTINGS_NAMESPACE,
  apply,
  credentialHeader,
  extractGeminiResponse,
  extractImage2Response,
  image2Size,
  inject,
  loadRuntimeConfig,
  name,
  parseRuntimeConfig,
  resolveEndpoint,
  resolveProtocol,
  resolveRuntimeConfig,
  validateSettings,
}
