# LAN Reader · 局域网书架

**简体中文** | [English](https://github.com/zhanglei1996/lan-library-reader/blob/main/README.en.md)

[![CI](https://github.com/zhanglei1996/lan-library-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/zhanglei1996/lan-library-reader/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/lan-reader.svg)](https://www.npmjs.com/package/lan-reader)
[![License: MIT](https://img.shields.io/badge/License-MIT-c95735.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.13-4e6a55.svg)](https://nodejs.org/)

把电脑上的文档和源码文件夹变成一个可以用浏览器阅读的局域网电子书架。

进入文件夹运行 `lan-reader` 后，电脑、手机和平板只要连接同一个局域网，就能查看目录并阅读文档。文件始终保留在自己的电脑上，不会上传到云端，也不会被修改或删除。

## 界面预览

![LAN Reader 局域网书架预览](https://raw.githubusercontent.com/zhanglei1996/lan-library-reader/main/docs/images/lan-reader-preview.png)

## 快速开始

需要提前安装 Node.js 22.13 或更高版本。

### 1. 安装

只需安装一次：

```bash
npm install -g lan-reader
```

### 2. 启动

进入想要阅读的文档目录：

```bash
cd "/Users/your-name/Documents/notes"
lan-reader
```

也可以直接指定目录：

```bash
lan-reader "/Users/your-name/Documents/notes"
```

默认在后台启动。终端显示访问地址后会立即返回，可以直接关闭终端：

```text
局域网书架已在后台启动（PID 12345）
本机访问：http://localhost:8080
局域网访问：http://192.168.1.20:8080
日志：/Users/your-name/.lan-library-reader/logs/lan-reader-....log
现在可以关闭当前终端。
运行 lan-reader stop 可一键停止全部书架。
```

- 当前电脑打开“本机访问”地址
- 手机或平板连接同一个 Wi-Fi，打开“局域网访问”地址
- 服务在后台运行，不需要保持终端窗口开启
- 如果显示多条局域网地址，优先尝试与手机或平板处于同一网段的地址

### 3. 停止

在任意终端执行：

```bash
lan-reader stop
```

该命令只会停止这台电脑上的 LAN Reader 服务，不会删除或修改文档。

## 主要功能

- 电子书式界面：文件目录、正文和本页大纲
- 响应式布局：适配电脑、手机和平板
- Markdown：标题、表格、任务列表、脚注、数学公式、提示块、代码高亮、Mermaid 和相对链接
- Mermaid 阅读：点击放大、50%–400% 缩放、快捷键、Mac 触控板/滚轮平滑缩放和全屏查看
- 图片阅读：独立图片直接进入书架，支持点击放大、缩放、全屏和打开原图
- 文本与源码：TXT 默认可用，其他扩展名可配置，支持语法高亮、行号和换行
- PDF：浏览器内嵌预览、缩放和字节范围请求
- Word/PPT：通过可选的 LibreOffice 转换为 PDF 预览
- 内容操作：复制全文、复制代码块、复制局域网链接和下载原文件
- 阅读设置：浅色/深色主题、字号调节、上一篇/下一篇和阅读位置恢复
- 目录能力：文件夹树、目录名/文件名/正文搜索、自动刷新和中文自然排序
- 快速分享：生成当前文档二维码，多网卡地址可切换
- 后台运行：关闭终端后继续提供服务，可统一查看和停止
- 更新提示：每天最多检查一次 npm 最新稳定版，不阻塞文档服务
- 大型书架：目录分支增量扫描和正文索引缓存
- 访问保护：可选临时访问码、会话 Cookie 和登录限流
- 本地优先：无需云盘、账号或数据库
- 只读安全：拒绝写入、目录穿越、隐藏文件和越界符号链接

## 支持的文件

| 文件类型 | 扩展名 | 预览方式 |
| --- | --- | --- |
| Markdown | `.md` `.markdown` `.mdown` | 网页排版 |
| 文本 | `.txt` | 等宽文本、行号和自动换行 |
| 自定义文本/源码 | 通过 `.lan-reader.json` 设置 | 安全纯文本与语法高亮 |
| PDF | `.pdf` | 浏览器内嵌 |
| Word | `.doc` `.docx` | LibreOffice 转 PDF |
| PowerPoint | `.ppt` `.pptx` | LibreOffice 转 PDF |
| 图片 | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.avif` `.bmp` `.svg` `.ico` | 直接预览、缩放、全屏和原图查看 |

没有安装 LibreOffice 时，Markdown、TXT 和 PDF 不受影响。Word 和 PowerPoint 文件仍会显示在目录中，并提供原文件下载。

Markdown 中标记为 `mermaid` 的代码块会自动渲染为流程图、时序图等图形。普通代码块仍按原样显示并提供复制按钮：

````markdown
```mermaid
flowchart TD
  Start[开始] --> Read[打开文档]
  Read --> End[完成]
```
````

脚注、数学公式和 GitHub 风格提示块可以直接使用：

```markdown
这里有一条脚注[^note]，行内公式为 $E = mc^2$。

> [!TIP]
> 点击 Markdown 图片可以放大、全屏或打开原图。

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

[^note]: 脚注内容会集中显示在文章末尾。
```

超过约 64 KB 的 Markdown 会按安全边界分段，并在浏览器空闲时逐批渲染。包含跨段脚注或引用定义的文档会自动使用完整渲染，避免链接或脚注失效。

## 目录扫描规则

启动目录不要求包含 Markdown。LAN Reader 会递归遍历子文件夹，查找所有支持的文档：

- 默认只收录深层目录中的 Markdown、TXT、PDF、Word、PowerPoint 和常见图片
- 其他类型默认不会收录，也不会占用书架的文档数量上限；通过 `.lan-reader.json` 配置后才会收录
- 只保留包含支持文档的目录分支
- 空目录和只有不支持文件的目录不会显示
- 跳过隐藏文件、隐藏目录、符号链接，以及常见构建目录：`node_modules`、`target`、`dist`、`build`、`out`、`coverage`、`vendor`、`bower_components`、`__pycache__`
- 独立图片会显示在目录中；Markdown 中的相对图片也会正常加载
- 书架最多收录 20,000 篇默认支持或主动配置的文档
- 为避免误扫超大型磁盘目录，内部另有 250,000 个文件和文件夹的遍历安全上限；未配置的源码等只参与查找，不计入书架文档数量
- 某个子目录临时消失或无权读取时，会跳过该目录，不影响其余书架

如果整个目录都没有支持的文档，服务仍会启动，但书架目录为空。

### 排除自定义目录

在启动目录创建 `.lan-readerignore`，每行填写一个不需要扫描的名称或相对路径：

```text
# 同名目录无论位于哪一层都会排除
generated

# 也可以只排除指定路径
docs/archive/
data/large-files
```

空行和以 `#` 开头的注释会被忽略。当前规则按目录名或相对路径精确匹配，不使用通配符，也不修改原文件。

## 项目配置：`.lan-reader.json`

`.lan-reader.json` 是可选的书架级配置文件，必须放在执行 `lan-reader` 的启动目录中。没有该文件时，LAN Reader 使用默认配置；不同书架可以分别配置，互不影响。

它与 `.lan-readerignore` 的用途不同：

- `.lan-reader.json`：设置书架名称、额外文本类型、预览方式和功能开关
- `.lan-readerignore`：排除不需要递归查找的目录或路径

TXT 已默认支持。要预览 JavaScript、TypeScript、Java、SQL、日志等纯文本文件，可以创建下面的完整配置：

```json
{
  "version": 1,
  "title": "我的源码书架",
  "textPreview": {
    "extensions": [".js", ".ts", ".java", ".sql", ".log", ".json", ".yaml"],
    "maxBytes": 8388608,
    "lineNumbers": true,
    "wrap": true,
    "syntaxHighlight": true
  },
  "features": {
    "copy": true,
    "download": true,
    "fullTextSearch": true,
    "autoRefresh": true,
    "readingPosition": true,
    "qrCode": true
  }
}
```

### 配置字段

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `version` | 数字 | 必填 | 当前只支持 `1`；创建配置文件时必须填写 |
| `title` | 字符串 | 启动目录名称 | 显示在页面顶部的书架名称，不能是空字符串 |
| `textPreview.extensions` | 字符串数组 | `[]` | 额外收录为纯文本的扩展名，例如 `.js`、`.log` |
| `textPreview.maxBytes` | 整数 | `8388608` | 单个纯文本文件的读取上限，范围为 1 KB 至 32 MB |
| `textPreview.lineNumbers` | 布尔值 | `true` | 打开文本时默认显示行号 |
| `textPreview.wrap` | 布尔值 | `true` | 打开文本时默认自动换行 |
| `textPreview.syntaxHighlight` | 布尔值 | `true` | 对已识别的源码类型启用语法高亮 |
| `features.copy` | 布尔值 | `true` | 显示复制全文和复制代码按钮 |
| `features.download` | 布尔值 | `true` | 允许下载原文件 |
| `features.fullTextSearch` | 布尔值 | `true` | 启用目录名、文件名和正文搜索 |
| `features.autoRefresh` | 布尔值 | `true` | 文件变化后自动刷新书架 |
| `features.readingPosition` | 布尔值 | `true` | 在当前浏览器中记录阅读位置 |
| `features.qrCode` | 布尔值 | `true` | 显示当前文档的局域网访问二维码 |

只需要配置某一项时，可以省略其他分组和字段。例如，仅加入 JS 与日志预览：

```json
{
  "version": 1,
  "textPreview": {
    "extensions": [".js", ".log"]
  }
}
```

### 配置规则

- 文件必须是合法 JSON，不能包含注释或末尾多余逗号，最大为 256 KB
- 自定义扩展名必须以 `.` 开头，不区分大小写；重复项会自动合并
- Markdown、TXT、PDF、Word、PowerPoint 和常见图片已默认支持，不需要重复配置
- 自定义扩展名只会按安全纯文本读取；代码、HTML 和 JavaScript 都不会执行
- 文本支持 UTF-8、UTF-8 BOM 和 GB18030/GBK 中文编码
- 不认识的字段会被忽略，并在页面底部显示配置警告
- 字段类型、扩展名或范围无效时，页面会显示具体配置错误，不会静默使用错误值
- 修改配置后通常会自动刷新；如果系统监听不可用，可以点击“刷新书架”

## 命令用法

```text
lan-reader [文件夹] [选项]
lan-reader list
lan-reader stop [端口或文件夹]
lan-reader check-update
lan-reader version
lan-reader help

命令：
list                    显示这台电脑上运行中的书架
stop                    停止全部书架，或按端口/文件夹停止一个书架
check-update            立即检查是否有新版本
version                 显示当前安装的版本
help                    显示帮助

选项：
-r, --root <文件夹>   要阅读的文件夹，默认是当前目录
-p, --port <端口>     起始端口，默认 8080；被占用时自动递增
    --host <地址>     监听地址，默认 0.0.0.0
    --protect         生成临时访问码保护书架
    --foreground      在当前终端前台运行
-v, --version         显示当前安装的版本
-h, --help            显示帮助
```

查看当前安装版本或完整帮助：

```bash
lan-reader --version
lan-reader --help
```

也可以使用等价的 `lan-reader version` 和 `lan-reader help`。

指定目录和端口：

```bash
lan-reader "/Users/your-name/Documents/notes" --port 9090
```

默认后台运行。如果需要调试或希望使用 `Ctrl+C` 停止当前服务，可以改为前台启动：

```bash
lan-reader --foreground
```

### 同时启动多个书架

命令启动完成后会立即返回，因此可以在同一个终端连续启动：

```bash
lan-reader "/Users/your-name/Documents/notes"
lan-reader "/Users/your-name/Documents/books"
```

第一个书架使用 `8080`。第二个发现端口已被占用后，会自动尝试 `8081`，然后继续逐一递增，最多尝试 100 个端口。终端会显示每个书架最终使用的地址、后台 PID 和日志文件。

全部停止：

```bash
lan-reader stop
```

查看所有书架，或只停止一个：

```bash
lan-reader list
lan-reader stop 8081
lan-reader stop "/Users/your-name/Documents/books"
```

## Word 和 PowerPoint 预览

Word 和 PowerPoint 预览需要安装 [LibreOffice](https://www.libreoffice.org/)。

检测到 LibreOffice 后，LAN Reader 会在后台以只读方式将 Office 文档转换为缓存 PDF，再交给浏览器预览。源文件不会被修改；文件大小或修改时间发生变化后，会自动生成新的缓存结果。

如果 LibreOffice 安装在非标准位置，可以指定可执行文件：

```bash
LIBREOFFICE_PATH="/path/to/soffice" lan-reader
```

## 更新和卸载

先查看当前安装的版本：

```bash
lan-reader --version
```

立即检查 npm 上是否发布了新版本：

```bash
lan-reader check-update
```

在交互式终端正常启动时，LAN Reader 每 24 小时最多自动检查一次 npm 的 `latest` 稳定版本。检查使用 1.2 秒超时；断网、缓存损坏或 npm 暂时不可用都不会影响书架启动。CI 和非交互终端默认不显示自动更新提示。

如需完全关闭自动检查：

```bash
LAN_READER_UPDATE_CHECK=0 lan-reader
```

这个环境变量只影响自动提示，仍然可以手动执行 `lan-reader check-update`。

更新到 npm 上的最新正式版本：

```bash
npm install -g lan-reader@latest
```

卸载：

```bash
npm uninstall -g lan-reader
```

## 局域网与安全

LAN Reader 面向家庭、宿舍或办公室局域网。普通启动保持无登录的便捷模式；包含源码、工作资料或隐私文档时，建议开启访问保护。

每次启动生成一个临时访问码：

```bash
lan-reader --protect
```

终端会显示 8 位访问码。也可以通过环境变量设置固定访问码：

```bash
LAN_READER_ACCESS_CODE="your-private-code" lan-reader
```

访问保护使用 12 小时本地会话 Cookie，连续输错会被短暂限流。局域网 HTTP 本身不提供传输加密，因此访问码不能替代可信网络，也不要复用重要密码。

- 只选择确实需要阅读的目录
- 不要直接公开包含密钥、隐私数据或工作机密的目录
- 不要在路由器上把服务端口映射到公网
- 不建议在公共 Wi-Fi 环境中启动
- macOS 或 Windows 首次询问网络权限时，只允许需要的局域网访问

文档接口保持只读。服务停止接口由每个实例的随机密钥保护，只供 `lan-reader stop` 调用。隐藏文件不会出现在目录中，指向书架外部的符号链接、未配置的源码类型和路径越界请求同样会被拒绝。

自动更新检查只向 npm Registry 请求 `lan-reader` 的公开版本元数据，不会发送书架路径、文件内容、局域网地址或访问码。

更多信息见 [安全说明](SECURITY.md)。

## 常见问题

### 手机或平板打不开

确认移动设备和电脑连接同一个 Wi-Fi，并检查电脑防火墙是否允许 Node.js 接收入站连接。移动设备必须使用启动信息中的局域网地址，不能使用 `localhost`。

### 为什么启动地址不是 8080

默认从 `8080` 开始。如果端口已被占用，LAN Reader 会自动尝试 `8081`、`8082`，直到找到可用端口，并在终端显示最终地址。也可以手动指定其他起始端口：

```bash
lan-reader --port 8081
```

### 关闭终端后书架还会运行吗

会。默认启动的是后台进程，终端显示地址后即可关闭。使用 `lan-reader list` 查看运行状态和日志路径，使用 `lan-reader stop` 停止全部书架。后台运行不等于开机自启，电脑重启后需要重新运行 `lan-reader`。

需要实时查看终端输出时，使用 `lan-reader --foreground` 前台启动。

### 新增文件后没有出现

服务会监听文件变化并自动刷新；监听不可用时，可以点击界面左下角的“刷新书架”重新扫描。

### 为什么 JS 文件没有出现

源码默认不会暴露到局域网。请在 `.lan-reader.json` 的 `textPreview.extensions` 中主动加入 `.js`，然后刷新书架。

### 手机无法自动复制

部分移动浏览器会限制普通 HTTP 页面的剪贴板权限。LAN Reader 会自动尝试兼容复制；仍不允许时会弹出文本框，可以长按手动复制。

### 文档会上传到互联网吗

不会。文档由运行 LAN Reader 的电脑直接发送给局域网内的浏览器。

### 可以在网页里修改文件吗

不可以。项目刻意保持只读，以降低误操作和局域网暴露风险。

## 版本设计

`0.2.0` 至 `0.5.0` 的产品、安全和测试设计记录见 [产品与开发计划](./ROADMAP.md)。

## 从源码开发

以下内容面向希望修改或参与项目开发的贡献者。通过 npm 安装的普通用户不需要执行这些命令。

```bash
git clone https://github.com/zhanglei1996/lan-library-reader.git
cd lan-library-reader
npm ci
```

启动内置示例书架：

```bash
npm run dev -- demo-library
```

构建并从源码启动：

```bash
npm run build
npm start -- demo-library
```

运行完整检查：

```bash
npm run check
npm run lint
npm audit
```

主要技术：

- React + TypeScript：阅读界面
- Vite：前端构建
- Node.js HTTP：静态资源、文档读取和局域网服务
- LibreOffice：可选的 Office 转 PDF

欢迎提交 Issue 和 Pull Request。维护者的 npm 发版流程见 [发布说明](RELEASING.md)。

## 开源许可

项目使用 [MIT License](LICENSE)。
