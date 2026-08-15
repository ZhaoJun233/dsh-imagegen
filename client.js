window.__ModuleLoader__.load({
  id: 'dsh-imagegen',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { createSnapshotStore } = require('@deepseek-ai/dsh-client-runtime/client')

    const NS = 'imagegen'
    const SETTINGS_DESCRIBE_PATH = '/api/imagegen/settings/describe'
    const SETTINGS_MUTATE_PATH = '/api/imagegen/settings/mutate'
    const PROTOCOLS = ['auto', 'gemini', 'image2']
    const QUALITIES = ['low', 'medium', 'high', 'auto']
    const DEFAULTS = {
      protocol: 'image2',
      url: '',
      apiKeyEnv: 'IMAGEGEN_API_KEY',
      apiKeyHeader: '',
      apiKeyPrefix: '',
      defaultModel: 'gpt-image-2',
      defaultQuality: 'medium',
      outputDirectory: 'generated-images',
    }

    const zh = {
      title: '生图服务',
      description: '配置 image_generate 使用的协议、URL、Key 与默认模型。',
      expand: '展开设置',
      collapse: '收起设置',
      unsaved: '未保存',
      notExposed: '当前设置桥未暴露 imagegen 命名空间。请重启 DSH Web 后重试。',
      readOnly: '当前部署的设置只读。',
      protocol: '协议',
      protocolHint: 'auto 会根据 URL 路径或模型名选择 Gemini 或 image2。',
      url: 'API URL',
      urlHint: '可填写基址或完整端点，插件会自动拼接生图路径。',
      apiKey: 'API Key',
      apiKeyHint: '留空不修改；保存后的 Key 不会在页面中回显。',
      clearKey: '清除已保存 Key',
      keyWillClear: '保存后将清除插件设置中的 Key，并回退到环境变量或旧配置文件。',
      apiKeyEnv: 'Key 环境变量',
      apiKeyEnvHint: '插件设置未保存 Key 时读取该环境变量。',
      apiKeyHeader: '鉴权请求头',
      apiKeyHeaderHint: '留空自动选择：Gemini 使用 x-goog-api-key，image2 使用 Authorization。',
      apiKeyPrefix: '鉴权前缀',
      apiKeyPrefixHint: '留空自动选择；Authorization 默认使用 Bearer 前缀。',
      defaultModel: '默认模型',
      defaultModelHint: '工具调用未指定 model 时使用。',
      defaultQuality: 'image2 默认质量',
      defaultQualityHint: '仅用于 image2 / OpenAI Images 协议。',
      outputDirectory: '默认输出目录',
      outputDirectoryHint: '必须是当前工作区内的相对目录。',
      overridden: '已覆盖',
      reset: '恢复默认',
      discard: '放弃',
      save: '保存',
      saving: '保存中...',
      invalid: '请检查此字段。',
      failed: '保存未完成，请检查配置后重试。',
    }

    const en = {
      title: 'Image generation',
      description: 'Configure the protocol, URL, key, and default model used by image_generate.',
      expand: 'Show settings',
      collapse: 'Hide settings',
      unsaved: 'Unsaved',
      notExposed: 'The imagegen namespace is not exposed by the settings bridge. Restart DSH Web and retry.',
      readOnly: 'Settings are read-only in this deployment.',
      protocol: 'Protocol',
      protocolHint: 'auto selects Gemini or image2 from the URL path or model name.',
      url: 'API URL',
      urlHint: 'Enter a base URL or full endpoint; the plugin appends the image path when needed.',
      apiKey: 'API key',
      apiKeyHint: 'Leave blank to keep the current value. Saved keys are never echoed back.',
      clearKey: 'Clear saved key',
      keyWillClear: 'Saving will clear the settings key and fall back to the environment variable or legacy file.',
      apiKeyEnv: 'Key environment variable',
      apiKeyEnvHint: 'Used when no key is stored in plugin settings.',
      apiKeyHeader: 'Credential header',
      apiKeyHeaderHint: 'Blank selects x-goog-api-key for Gemini or Authorization for image2.',
      apiKeyPrefix: 'Credential prefix',
      apiKeyPrefixHint: 'Blank selects the protocol default; Authorization uses Bearer by default.',
      defaultModel: 'Default model',
      defaultModelHint: 'Used when the tool call does not specify model.',
      defaultQuality: 'Default image2 quality',
      defaultQualityHint: 'Used only for image2 / OpenAI Images.',
      outputDirectory: 'Default output directory',
      outputDirectoryHint: 'Must be a relative directory inside the current workspace.',
      overridden: 'Overridden',
      reset: 'Reset',
      discard: 'Discard',
      save: 'Save',
      saving: 'Saving...',
      invalid: 'Check this field.',
      failed: 'The save did not complete. Check the configuration and retry.',
    }

    const styles = {
      card: { listStyle: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-3)', overflow: 'hidden' },
      header: { width: '100%', border: 0, background: 'transparent', color: 'inherit', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left', font: 'inherit' },
      headText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
      title: { color: 'var(--dsw-alias-label-primary)', fontWeight: 600, fontSize: 13 },
      description: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: 1.5 },
      pending: { color: 'var(--dsw-alias-state-warn-primary)', fontSize: 12, whiteSpace: 'nowrap' },
      body: { padding: '2px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 },
      status: { margin: 0, color: 'var(--dsw-alias-state-warn-primary)', fontSize: 12, lineHeight: 1.5 },
      field: { display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 10, borderTop: '1px solid var(--dsw-alias-border-l2)' },
      fieldHead: { display: 'flex', alignItems: 'center', gap: 8 },
      label: { flex: 1, color: 'var(--dsw-alias-label-primary)', fontWeight: 500, fontSize: 13 },
      badge: { color: 'var(--dsw-alias-state-business-primary)', fontSize: 11 },
      reset: { border: 0, background: 'transparent', padding: 0, color: 'var(--dsw-alias-state-business-primary)', cursor: 'pointer', fontSize: 11 },
      input: { width: '100%', minHeight: 34, boxSizing: 'border-box', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, background: 'var(--dsw-specific-input-major)', color: 'var(--dsw-alias-label-primary)', padding: '6px 8px', font: 'inherit', fontSize: 13 },
      invalidInput: { width: '100%', minHeight: 34, boxSizing: 'border-box', border: '1px solid var(--dsw-alias-state-error-primary)', borderRadius: 6, background: 'var(--dsw-specific-input-major)', color: 'var(--dsw-alias-label-primary)', padding: '6px 8px', font: 'inherit', fontSize: 13 },
      hint: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: 1.5 },
      invalid: { margin: 0, color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, lineHeight: 1.5 },
      secretActions: { display: 'flex', alignItems: 'center', gap: 8 },
      footer: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingTop: 2 },
      failure: { margin: '0 auto 0 0', color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 },
      secondary: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', padding: '5px 11px', cursor: 'pointer', font: 'inherit', fontSize: 13 },
      primary: { border: '1px solid var(--dsw-alias-button-info-fill)', borderRadius: 6, background: 'var(--dsw-alias-button-info-fill)', color: 'var(--dsw-alias-label-primary-foreground)', padding: '5px 12px', cursor: 'pointer', font: 'inherit', fontSize: 13 },
    }

    function valueOf(snapshot, field) {
      return snapshot.value && typeof snapshot.value === 'object' ? snapshot.value[field] : undefined
    }

    function layerHas(snapshot, field) {
      return snapshot.user && typeof snapshot.user === 'object' && Object.hasOwn(snapshot.user, field)
    }

    function validField(field, value) {
      if (field === 'protocol') return PROTOCOLS.includes(value)
      if (field === 'defaultQuality') return QUALITIES.includes(value)
      if (field === 'url') {
        try {
          const url = new URL(value)
          return url.protocol === 'http:' || url.protocol === 'https:'
        } catch {
          return false
        }
      }
      if (field === 'defaultModel' || field === 'outputDirectory') return value.trim().length > 0
      return true
    }

    class ImagegenSettingsScope {
      constructor() {
        this.store = createSnapshotStore({
          status: 'loading',
          value: undefined,
          base: undefined,
          user: undefined,
          revision: undefined,
          writable: false,
        })
        void this.load()
      }

      getSnapshot() {
        return this.store.getSnapshot()
      }

      subscribe(listener) {
        return this.store.subscribe(listener)
      }

      async post(path, body) {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        const payload = await response.json()
        if (!response.ok || payload?.ok !== true) throw new Error(payload?.message ?? `Settings request failed (${response.status})`)
        return payload.value
      }

      accept(result) {
        const descriptor = result?.descriptor
        this.store.set(descriptor === undefined ? {
          status: 'unavailable',
          value: undefined,
          base: undefined,
          user: undefined,
          revision: undefined,
          writable: Boolean(result?.writable),
        } : {
          status: 'ready',
          value: descriptor.value,
          base: descriptor.base,
          user: descriptor.user,
          revision: descriptor.revision,
          writable: Boolean(result?.writable),
        })
      }

      async load() {
        try {
          this.accept(await this.post(SETTINGS_DESCRIBE_PATH, {}))
        } catch {
          this.accept({ descriptor: undefined, writable: false })
        }
      }

      async write(op) {
        const revision = this.getSnapshot().revision
        try {
          this.accept(await this.post(SETTINGS_MUTATE_PATH, {
            ops: [op],
            ...(revision === undefined ? {} : { expectedRevision: revision }),
          }))
        } catch (error) {
          await this.load()
          throw error
        }
      }

      set(field, value) {
        return this.write({ op: 'set', path: [field], value })
      }

      unset(field) {
        return this.write({ op: 'unset', path: [field] })
      }
    }

    class SettingsCardController {
      constructor(scope) {
        this.scope = scope
        this.staged = new Map()
        this.secret = ''
        this.clearSecret = false
        this.saving = false
        this.failed = false
        this.store = createSnapshotStore(this.project())
        scope.subscribe(() => this.publish())
      }

      project() {
        const snapshot = this.scope.getSnapshot()
        const fields = {}
        for (const field of Object.keys(DEFAULTS)) {
          const staged = this.staged.get(field)
          const text = staged ? staged.text : String(valueOf(snapshot, field) ?? DEFAULTS[field])
          fields[field] = {
            text,
            overridden: staged ? !staged.clear : layerHas(snapshot, field),
            invalid: !validField(field, text),
          }
        }
        const dirty = this.staged.size > 0 || this.secret.trim().length > 0 || this.clearSecret
        return {
          available: snapshot.status !== 'loading',
          exposed: snapshot.status === 'ready',
          writable: snapshot.writable,
          dirty,
          invalid: Object.values(fields).some((field) => field.invalid),
          saving: this.saving,
          failed: this.failed,
          secret: this.secret,
          clearSecret: this.clearSecret,
          fields,
        }
      }

      publish() {
        this.store.set(this.project())
      }

      inject() {
        return {
          hooks: { imagegenSettingsCard: this.store },
          edit: (field, text) => {
            this.staged.set(field, { text, clear: false })
            this.failed = false
            this.publish()
          },
          resetField: (field) => {
            this.staged.set(field, { text: String(DEFAULTS[field] ?? ''), clear: true })
            this.failed = false
            this.publish()
          },
          editSecret: (text) => {
            this.secret = text
            if (text.length > 0) this.clearSecret = false
            this.failed = false
            this.publish()
          },
          toggleClearSecret: () => {
            this.clearSecret = !this.clearSecret
            if (this.clearSecret) this.secret = ''
            this.failed = false
            this.publish()
          },
          save: () => { void this.save() },
          discard: () => {
            this.staged.clear()
            this.secret = ''
            this.clearSecret = false
            this.failed = false
            this.publish()
          },
        }
      }

      async save() {
        const projected = this.project()
        if (!projected.dirty || projected.invalid || projected.saving || !projected.writable) return
        this.saving = true
        this.failed = false
        this.publish()
        try {
          for (const [field, staged] of this.staged) {
            if (staged.clear || staged.text === '') await this.scope.unset(field)
            else await this.scope.set(field, staged.text)
          }
          if (this.clearSecret) await this.scope.unset('apiKey')
          else if (this.secret.trim()) await this.scope.set('apiKey', this.secret.trim())
          this.staged.clear()
          this.secret = ''
          this.clearSecret = false
        } catch {
          this.failed = true
        }
        this.saving = false
        this.publish()
      }
    }

    function Field(props) {
      const inputStyle = props.state.invalid ? styles.invalidInput : styles.input
      return React.createElement('div', { style: styles.field },
        React.createElement('div', { style: styles.fieldHead },
          React.createElement('label', { htmlFor: props.id, style: styles.label }, props.label),
          props.state.overridden ? React.createElement('span', { style: styles.badge }, props.t('overridden')) : null,
          props.state.overridden ? React.createElement('button', { type: 'button', style: styles.reset, disabled: props.disabled, onClick: props.onReset }, props.t('reset')) : null,
        ),
        props.options
          ? React.createElement('select', { id: props.id, style: inputStyle, value: props.state.text, disabled: props.disabled, onChange: (event) => props.onEdit(event.target.value) }, props.options.map((option) => React.createElement('option', { key: option, value: option }, option)))
          : React.createElement('input', { id: props.id, type: props.type ?? 'text', style: inputStyle, value: props.state.text, disabled: props.disabled, autoComplete: 'off', onChange: (event) => props.onEdit(event.target.value) }),
        React.createElement('p', { style: props.state.invalid ? styles.invalid : styles.hint }, props.state.invalid ? props.t('invalid') : props.hint),
      )
    }

    function ImagegenSettingsCard(props) {
      const [open, setOpen] = React.useState(false)
      const state = props.useImagegenSettingsCard((snapshot) => snapshot)
      const t = props.t
      if (!state.available) return null
      const disabled = !state.writable || state.saving
      const field = (name, label, hint, options) => React.createElement(Field, {
        key: name,
        id: `imagegen-${name}`,
        t,
        label: t(label),
        hint: t(hint),
        state: state.fields[name],
        disabled,
        options,
        onEdit: (text) => props.edit(name, text),
        onReset: () => props.resetField(name),
      })

      return React.createElement('li', { style: styles.card },
        React.createElement('button', { type: 'button', style: styles.header, 'aria-expanded': open, 'aria-label': `${t(open ? 'collapse' : 'expand')}: ${t('title')}`, onClick: () => setOpen(!open) },
          React.createElement('span', { style: styles.headText },
            React.createElement('span', { style: styles.title }, t('title')),
            React.createElement('span', { style: styles.description }, t('description')),
          ),
          state.dirty ? React.createElement('span', { style: styles.pending }, t('unsaved')) : null,
          React.createElement('span', { 'aria-hidden': true }, open ? '▴' : '▾'),
        ),
        open ? React.createElement('div', { style: styles.body },
          !state.exposed ? React.createElement('p', { style: styles.status, role: 'status' }, t('notExposed')) : null,
          state.exposed && !state.writable ? React.createElement('p', { style: styles.status, role: 'status' }, t('readOnly')) : null,
          state.exposed ? field('protocol', 'protocol', 'protocolHint', PROTOCOLS) : null,
          state.exposed ? field('url', 'url', 'urlHint') : null,
          state.exposed ? React.createElement('div', { style: styles.field },
            React.createElement('div', { style: styles.fieldHead }, React.createElement('label', { htmlFor: 'imagegen-apiKey', style: styles.label }, t('apiKey'))),
            React.createElement('input', { id: 'imagegen-apiKey', type: 'password', style: styles.input, value: state.secret, disabled, autoComplete: 'new-password', onChange: (event) => props.editSecret(event.target.value) }),
            React.createElement('div', { style: styles.secretActions },
              React.createElement('input', { id: 'imagegen-clear-key', type: 'checkbox', checked: state.clearSecret, disabled, onChange: props.toggleClearSecret }),
              React.createElement('label', { htmlFor: 'imagegen-clear-key', style: styles.hint }, t('clearKey')),
            ),
            React.createElement('p', { style: styles.hint }, state.clearSecret ? t('keyWillClear') : t('apiKeyHint')),
          ) : null,
          state.exposed ? field('apiKeyEnv', 'apiKeyEnv', 'apiKeyEnvHint') : null,
          state.exposed ? field('apiKeyHeader', 'apiKeyHeader', 'apiKeyHeaderHint') : null,
          state.exposed ? field('apiKeyPrefix', 'apiKeyPrefix', 'apiKeyPrefixHint') : null,
          state.exposed ? field('defaultModel', 'defaultModel', 'defaultModelHint') : null,
          state.exposed ? field('defaultQuality', 'defaultQuality', 'defaultQualityHint', QUALITIES) : null,
          state.exposed ? field('outputDirectory', 'outputDirectory', 'outputDirectoryHint') : null,
          state.exposed ? React.createElement('div', { style: styles.footer },
            state.failed ? React.createElement('p', { style: styles.failure, role: 'status' }, t('failed')) : null,
            React.createElement('button', { type: 'button', style: styles.secondary, disabled: !state.dirty || state.saving, onClick: props.discard }, t('discard')),
            React.createElement('button', { type: 'button', style: styles.primary, disabled: !state.dirty || state.invalid || state.saving || !state.writable, onClick: props.save }, t(state.saving ? 'saving' : 'save')),
          ) : null,
        ) : null,
      )
    }

    const inject = ['slots', 'locale']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'imagegen: dictionaries')
      const scope = new ImagegenSettingsScope()
      const controller = new SettingsCardController(scope)
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        id: 'imagegen',
        order: 80,
        locale: NS,
        inject: () => controller.inject(),
      }, ImagegenSettingsCard))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
