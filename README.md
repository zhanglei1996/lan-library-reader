# LAN Library Reader · 局域网书架

[![CI](https://github.com/zhanglei1996/lan-library-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/zhanglei1996/lan-library-reader/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-c95735.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.13-4e6a55.svg)](https://nodejs.org/)

把电脑上的任意文档文件夹变成一个局域网电子书架。

在目标文件夹启动服务后，电脑、手机和平板只要连接同一个局域网，就能通过浏览器查看目录、阅读 Markdown 和 PDF。文件始终保留在自己的电脑上，服务不会上传、修改或删除源文件。

## 它适合解决什么问题

- 在 Pad 上阅读电脑里积累的 Markdown 学习笔记
- 把课程资料、说明文档和 PDF 整理成可浏览的个人书架
- 在家庭或办公室网络中临时共享只读文档
- 不依赖云盘，不需要逐个导出或同步文件
- 用统一界面查看 Markdown、PDF，以及可选的 Word/PPT

典型使用方式：

```text
电脑上的学习笔记文件夹
        ↓ 启动 lan-reader
http://192.168.1.20:8080
        ↓ 同一 Wi-Fi
手机 / Pad / 另一台电脑浏览器
```

## 主要功能

- 电子书式阅读界面：文件目录、正文、本页大纲三栏布局
- 响应式设计：桌面、手机和平板使用不同的导航方式
- Markdown：标题、表格、任务列表、引用、代码块和相对链接
- PDF：浏览器内嵌预览、分页缩放和字节范围请求
- Office：检测 LibreOffice 后，将 Word/PPT 转成缓存 PDF 预览
- 阅读设置：浅色/深色主题、字号调节、上一篇/下一篇
- 目录能力：文件夹树、文件名搜索、手动刷新、中文自然排序
- 本地优先：不上传云端，不依赖外部数据库
- 只读安全：拒绝写入、目录穿越、隐藏文件和越界符号链接

## 支持的文件

| 文件类型 | 扩展名 | 预览方式 |
| --- | --- | --- |
| Markdown | `.md` `.markdown` `.mdown` | 网页排版 |
| PDF | `.pdf` | 浏览器内嵌 |
| Word | `.doc` `.docx` | LibreOffice 转 PDF |
| PowerPoint | `.ppt` `.pptx` | LibreOffice 转 PDF |
| Markdown 图片 | PNG、JPEG、GIF、WebP、AVIF、BMP、SVG | 按相对路径加载 |

Word/PPT 预览是可选能力。没有安装 LibreOffice 时，Markdown 和 PDF 不受影响，Office 文件仍会显示在目录中并提供原文件下载。

## 快速开始

### 1. 准备环境

- Node.js 22.13 或更高版本
- npm
- 可选：[LibreOffice](https://www.libreoffice.org/)，用于 Word/PPT 预览

### 2. 安装命令

只需安装一次：

```bash
npm install -g github:zhanglei1996/lan-library-reader
```

### 3. 在文档目录启动

进入任何想要阅读的文件夹，直接运行：

```bash
cd "/Users/your-name/Documents/notes"
lan-reader
```

也可以不切换目录，直接把文件夹路径传给命令：

```bash
lan-reader "/Users/your-name/Documents/notes"
```

成功启动后，终端会明确显示可访问的地址和终止方式：

```text
局域网书架已启动
本机访问：http://localhost:8080
局域网访问：http://192.168.1.20:8080
按 Ctrl+C 停止当前服务。
运行 lan-reader stop 可一键停止全部书架。
```

电脑可以打开本机地址。手机或平板连接同一个 Wi-Fi 后，打开局域网地址即可。

## 停止服务

停止当前终端启动的书架，在运行服务的终端窗口按：

```text
Ctrl + C
```

如果同时为多个文件夹启动了服务，可以在任意终端一键停止这台电脑上的全部书架：

```bash
lan-reader stop
```

尚未安装全局命令时，也可以在项目目录执行：

```bash
npm start -- stop
```

命令会向每个已登记的书架发送带随机密钥的本机停止请求，让服务正常退出并清理实例记录。它只停止 LAN Library Reader 进程，不会删除或修改书架中的文档。

## 更新和卸载

重新运行安装命令即可更新到 GitHub 上的最新版本：

```bash
npm install -g github:zhanglei1996/lan-library-reader
```

卸载全局命令：

```bash
npm uninstall -g lan-library-reader
```

## 从源码运行

如果要参与开发，可以克隆项目并安装依赖：

```bash
git clone https://github.com/zhanglei1996/lan-library-reader.git
cd lan-library-reader
npm install
npm run build
```

读取当前文件夹：

```bash
npm start
```

读取指定文件夹：

```bash
npm start -- "/Users/your-name/Documents/notes"
```

## 命令参数

```text
lan-reader [文件夹] [选项]
lan-reader stop

命令：
stop                    一键停止这台电脑上的全部书架

-r, --root <文件夹>   要阅读的文件夹，默认是当前目录
-p, --port <端口>     服务端口，默认 8080
    --host <地址>     监听地址，默认 0.0.0.0
-h, --help            显示帮助
```

例如：

```bash
lan-reader "/Users/your-name/Documents/notes" --port 9090
```

## Word 和 PowerPoint 预览

程序启动时会自动寻找 LibreOffice。检测成功后：

1. 用户在目录中选择 Word 或 PowerPoint 文件。
2. 电脑在后台以只读方式转换为 PDF。
3. 转换结果保存在系统临时缓存中。
4. 浏览器使用与普通 PDF 相同的界面预览。

源 Office 文件不会被修改。源文件的大小或修改时间变化后，会生成新的缓存结果。

如果 LibreOffice 安装在非标准位置，可以设置：

```bash
LIBREOFFICE_PATH="/path/to/soffice" lan-reader
```

## 局域网与安全

该工具面向可信的家庭、宿舍或办公室局域网，当前没有账号登录功能。

- 只把确实需要阅读的目录作为书架根目录
- 不要将含有密钥、隐私数据或工作机密的目录直接公开
- 不要在路由器上把服务端口映射到公网
- 公共 Wi-Fi 环境下不建议启动服务
- macOS 或 Windows 首次询问网络权限时，只允许需要的局域网访问

所有文档接口只接受 `GET` 和 `HEAD` 请求。唯一的 `POST` 接口用于服务生命周期控制，由每个实例的随机密钥保护，只供 `lan-reader stop` 调用。隐藏文件不会出现在目录中，也不能通过网址读取；指向书架外部的符号链接同样会被拒绝。

更多安全说明见 [SECURITY.md](SECURITY.md)。

## 常见问题

### 手机打不开地址

确认手机和电脑连接同一个 Wi-Fi，并检查电脑防火墙是否允许 Node.js 接收入站连接。请使用启动信息里的局域网地址，不要在手机上访问 `localhost`。

### 新增文件后没有出现

点击左下角“刷新书架”。服务会重新扫描目录，但不会修改文件。

### 文档会上传到互联网吗

不会。文件由运行服务的电脑直接发送给局域网浏览器。应用本身不需要云端数据库或第三方存储。

### 可以在网页里修改文件吗

不可以。项目刻意保持只读，以降低误操作和局域网暴露风险。

## 开发

启动内置示例书架：

```bash
npm run dev -- demo-library
```

运行完整检查：

```bash
npm run check
npm run lint
npm audit
```

项目包含以下自动测试：

- 目录树扫描、中文排序和文件类型识别
- Markdown 内容与元数据读取
- 目录穿越、隐藏文件和越界符号链接拦截
- 只读 HTTP 方法限制
- PDF 字节范围请求
- Office 转换器扩展接口

## 技术结构

- React + TypeScript：阅读界面
- Vite：前端构建和开发服务
- Node.js HTTP：静态资源、文档读取和局域网服务
- react-markdown：安全的 Markdown 渲染
- LibreOffice：可选的 Office 转 PDF 转换

项目不需要数据库。生产模式下，网页与文档接口由同一个端口提供。

## 参与贡献

欢迎提交 Issue 和 Pull Request。提交代码前请运行：

```bash
npm run check
npm run lint
```

## 开源许可

项目使用 [MIT License](LICENSE)。
