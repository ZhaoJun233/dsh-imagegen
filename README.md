# dsh-imagegen

Provider-neutral image generation plugin for DeepSeek Harness. It registers the `image_generate` agent tool and supports:

- Gemini-compatible `generateContent` endpoints
- image2 / OpenAI-compatible `/images/generations` endpoints
- base64 and downloadable URL responses
- runtime configuration from the DSH plugin settings page
- secret redaction for API credentials
- workspace-confined output paths and image-size limits

## Install

Add the package to a DSH Web profile:

```powershell
dsh plugin --profile web add link:C:\path\to\dsh-imagegen
```

Restart the DSH Web host after installing or updating plugin code.

## Configure

Open **Settings → Plugins → Plugin configuration → Image generation** and set:

- protocol: `auto`, `gemini`, or `image2`
- API URL
- API Key or environment-variable name
- credential header and optional prefix
- default model
- default image2 quality
- workspace-relative output directory

The API Key field is write-only. Secret-role values are removed from settings responses and are never echoed by the page.

The public defaults use placeholder connection values. Configure a real endpoint and credential before calling the tool.

### Gemini-compatible example

```json
{
  "protocol": "gemini",
  "url": "<GEMINI_COMPATIBLE_ENDPOINT>",
  "apiKeyEnv": "IMAGEGEN_API_KEY",
  "apiKeyHeader": "x-goog-api-key",
  "apiKeyPrefix": "",
  "defaultModel": "your-image-model"
}
```

When a base URL is supplied, the plugin appends `/v1beta/models/{model}:generateContent` as needed.

### image2-compatible example

```json
{
  "protocol": "image2",
  "url": "<IMAGE_API_BASE_URL>",
  "apiKeyEnv": "IMAGEGEN_API_KEY",
  "apiKeyHeader": "Authorization",
  "apiKeyPrefix": "Bearer ",
  "defaultModel": "gpt-image-2",
  "defaultQuality": "medium"
}
```

When a base URL is supplied, the plugin appends `/images/generations` as needed. It requests `b64_json` and also accepts providers that return a downloadable image URL.

## Tool

`image_generate` accepts:

- `prompt` (required)
- `model`
- `aspect_ratio`
- `image_size` for Gemini-compatible APIs
- `size` and `quality` for image2-compatible APIs
- `output_path`, relative to the current workspace

Generated files default to `generated-images/` in the current session workspace.

## Legacy runtime file

The optional fallback file is:

```text
~/.dsh/dsh-imagegen.json
```

It is read only when neither plugin settings nor the configured environment variable supplies a credential. Do not commit this file when it contains a Key.

## Composition

```yaml
- id: imagegen
  name: dsh-imagegen
  config:
    runtimeConfigPath: ~/.dsh/dsh-imagegen.json
    outputDirectory: generated-images
    timeoutMs: 180000
    maxImageBytes: 20971520
```
