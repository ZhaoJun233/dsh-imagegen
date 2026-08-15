# dsh-imagegen

[English](README.md) | [简体中文](README.zh-CN.md)

这是一个面向 DeepSeek Harness 的通用生图插件，不绑定具体服务商。插件会注册 `image_generate` Agent 工具，并支持：

- Gemini 兼容的 `generateContent` 接口
- image2 / OpenAI 兼容的 `/images/generations` 接口
- Base64 图片和远程图片 URL 两种响应形式
- 在 DSH 插件设置页中动态配置
- API 凭据脱敏，不向页面回显
- 输出路径限制在当前工作区内
- 图片文件大小限制

## 安装

从 GitHub 直接安装到 DSH Web profile：

```powershell
dsh plugin --profile web add github:ZhaoJun233/dsh-imagegen
```

本地开发时可改为链接当前检出目录：

```powershell
dsh plugin --profile web add link:C:\path\to\dsh-imagegen
```

安装或更新插件代码后，需要重启 DSH Web Host。

## 配置

打开 **设置 → 插件 → 插件配置 → 生图服务**，填写以下内容：

- 协议：`auto`、`gemini` 或 `image2`
- API URL
- API Key 或保存 Key 的环境变量名
- 鉴权请求头和可选前缀
- 默认模型
- image2 默认质量
- 工作区内的默认输出目录

API Key 输入框是只写字段。设置接口会移除 secret 字段，页面不会读取或回显已经保存的 Key。

公开源码中的 URL 默认为空。首次使用前必须填写实际接口地址和凭据。

### Gemini 兼容配置示例

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

填写基址时，插件会按需自动拼接 `/v1beta/models/{model}:generateContent`。

### image2 兼容配置示例

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

填写基址时，插件会按需自动拼接 `/images/generations`。插件请求 `b64_json`，同时兼容返回可下载图片 URL 的服务。

## Agent 工具

`image_generate` 支持以下参数：

- `prompt`：必填，生图提示词
- `model`：临时覆盖默认模型
- `aspect_ratio`：宽高比
- `image_size`：Gemini 兼容接口的分辨率等级
- `size`、`quality`：image2 兼容接口的尺寸和质量
- `output_path`：当前工作区内的相对输出路径

未指定输出路径时，图片默认保存到当前会话工作区的 `generated-images/` 目录。

## 旧版运行时配置文件

插件仍兼容以下可选后备文件：

```text
~/.dsh/dsh-imagegen.json
```

仅当插件设置和指定环境变量都没有提供凭据时，插件才会读取这个文件。如果文件中包含 Key，请勿将其提交到版本控制系统。

## Composition 配置

```yaml
- id: imagegen
  name: dsh-imagegen
  config:
    runtimeConfigPath: ~/.dsh/dsh-imagegen.json
    outputDirectory: generated-images
    timeoutMs: 180000
    maxImageBytes: 20971520
```

## 安全说明

- 不要在 Issue、日志或公开配置中粘贴真实 API Key。
- 建议优先通过环境变量或插件设置页保存凭据。
- `output_path` 必须是工作区内的相对路径，插件会拒绝路径穿越和绝对路径。
- 远程服务返回的图片必须是受支持的 MIME 类型，并且不能超过配置的大小限制。
