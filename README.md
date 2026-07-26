# LAN Reader · 局域网书架

[![CI](https://github.com/zhanglei1996/lan-library-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/zhanglei1996/lan-library-reader/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/lan-reader.svg)](https://www.npmjs.com/package/lan-reader)
[![License: MIT](https://img.shields.io/badge/License-MIT-c95735.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.13-4e6a55.svg)](https://nodejs.org/)

把电脑上的文档文件夹变成一个可以用浏览器阅读的局域网电子书架。

进入文件夹运行 `lan-reader` 后，电脑、手机和平板只要连接同一个局域网，就能查看目录并阅读文档。文件始终保留在自己的电脑上，不会上传到云端，也不会被修改或删除。

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

启动后，终端会显示类似信息：

```text
局域网书架已启动
本机访问：http://localhost:8080
局域网访问：http://192.168.1.20:8080
按 Ctrl+C 停止当前服务。
运行 lan-reader stop 可一键停止全部书架。
```

- 当前电脑打开“本机访问”地址
- 手机或平板连接同一个 Wi-Fi，打开“局域网访问”地址
- 服务运行期间请保持终端窗口开启
- 如果显示多条局域网地址，优先尝试与手机或平板处于同一网段的地址

### 3. 停止

在启动服务的终端按 `Ctrl+C`，停止当前书架。

如果同时启动了多个书架，可以在任意终端执行：

```bash
lan-reader stop
```

该命令只会停止这台电脑上的 LAN Reader 服务，不会删除或修改文档。

## 主要功能

- 电子书式界面：文件目录、正文和本页大纲
- 响应式布局：适配电脑、手机和平板
- Markdown：标题、表格、任务列表、引用、代码块和相对链接
- PDF：浏览器内嵌预览、缩放和字节范围请求
- Word/PPT：通过可选的 LibreOffice 转换为 PDF 预览
- 阅读设置：浅色/深色主题、字号调节、上一篇/下一篇
- 目录能力：文件夹树、文件名搜索、刷新和中文自然排序
- 本地优先：无需云盘、账号或数据库
- 只读安全：拒绝写入、目录穿越、隐藏文件和越界符号链接

## 支持的文件

| 文件类型 | 扩展名 | 预览方式 |
| --- | --- | --- |
| Markdown | `.md` `.markdown` `.mdown` | 网页排版 |
| PDF | `.pdf` | 浏览器内嵌 |
| Word | `.doc` `.docx` | LibreOffice 转 PDF |
| PowerPoint | `.ppt` `.pptx` | LibreOffice 转 PDF |
| Markdown 图片 | PNG、JPEG、GIF、WebP、AVIF、BMP、SVG | 按相对路径加载 |

没有安装 LibreOffice 时，Markdown 和 PDF 不受影响。Word 和 PowerPoint 文件仍会显示在目录中，并提供原文件下载。

## 命令用法

```text
lan-reader [文件夹] [选项]
lan-reader stop

命令：
stop                    停止这台电脑上的全部书架

选项：
-r, --root <文件夹>   要阅读的文件夹，默认是当前目录
-p, --port <端口>     服务端口，默认 8080
    --host <地址>     监听地址，默认 0.0.0.0
-h, --help            显示帮助
```

指定目录和端口：

```bash
lan-reader "/Users/your-name/Documents/notes" --port 9090
```

### 同时启动多个书架

每个书架需要使用不同端口：

```bash
lan-reader "/Users/your-name/Documents/notes" --port 8080
lan-reader "/Users/your-name/Documents/books" --port 8081
```

全部停止：

```bash
lan-reader stop
```

## Word 和 PowerPoint 预览

Word 和 PowerPoint 预览需要安装 [LibreOffice](https://www.libreoffice.org/)。

检测到 LibreOffice 后，LAN Reader 会在后台以只读方式将 Office 文档转换为缓存 PDF，再交给浏览器预览。源文件不会被修改；文件大小或修改时间发生变化后，会自动生成新的缓存结果。

如果 LibreOffice 安装在非标准位置，可以指定可执行文件：

```bash
LIBREOFFICE_PATH="/path/to/soffice" lan-reader
```

## 更新和卸载

更新到 npm 上的最新正式版本：

```bash
npm install -g lan-reader@latest
```

卸载：

```bash
npm uninstall -g lan-reader
```

## 局域网与安全

LAN Reader 面向可信的家庭、宿舍或办公室局域网，目前没有账号登录功能。

- 只选择确实需要阅读的目录
- 不要直接公开包含密钥、隐私数据或工作机密的目录
- 不要在路由器上把服务端口映射到公网
- 不建议在公共 Wi-Fi 环境中启动
- macOS 或 Windows 首次询问网络权限时，只允许需要的局域网访问

所有文档接口只接受 `GET` 和 `HEAD` 请求。服务停止接口由每个实例的随机密钥保护，只供 `lan-reader stop` 调用。隐藏文件不会出现在目录中，指向书架外部的符号链接同样会被拒绝。

更多信息见 [安全说明](SECURITY.md)。

## 常见问题

### 手机或平板打不开

确认移动设备和电脑连接同一个 Wi-Fi，并检查电脑防火墙是否允许 Node.js 接收入站连接。移动设备必须使用启动信息中的局域网地址，不能使用 `localhost`。

### 提示端口已被占用

默认端口是 `8080`。可以停止已经运行的书架，或换一个端口：

```bash
lan-reader --port 8081
```

### 新增文件后没有出现

点击界面左下角的“刷新书架”，服务会重新扫描目录。

### 文档会上传到互联网吗

不会。文档由运行 LAN Reader 的电脑直接发送给局域网内的浏览器。

### 可以在网页里修改文件吗

不可以。项目刻意保持只读，以降低误操作和局域网暴露风险。

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
