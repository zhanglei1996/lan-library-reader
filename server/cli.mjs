import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

export const VERSION = packageJson.version;

export function parseArguments(argv, defaults = {}) {
  const options = {
    root: defaults.root ?? process.cwd(),
    host: defaults.host ?? "0.0.0.0",
    port: defaults.port ?? 8080,
    protect: defaults.protect ?? false,
    foreground: defaults.foreground ?? false,
    help: false,
    version: false,
  };
  const positional = [];

  function valueAfter(index, option) {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("-")) {
      throw new Error(`参数 ${option} 缺少值`);
    }
    return value;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--version" || argument === "-v") {
      options.version = true;
    } else if (argument === "--root" || argument === "-r") {
      options.root = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--port" || argument === "-p") {
      options.port = Number(valueAfter(index, argument));
      index += 1;
    } else if (argument === "--host") {
      options.host = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--protect") {
      options.protect = true;
    } else if (argument === "--foreground") {
      options.foreground = true;
    } else if (argument.startsWith("-")) {
      throw new Error(`未知参数：${argument}`);
    } else {
      positional.push(argument);
    }
  }

  if (positional.length > 1) throw new Error("只能指定一个要阅读的文件夹");
  if (positional[0]) options.root = positional[0];
  if (!options.root) throw new Error("请提供要阅读的文件夹");
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error("端口必须是 0 到 65535 之间的整数");
  }
  return options;
}

export const HELP_TEXT = `
局域网书架
默认在后台运行，启动完成后可以关闭终端。

用法：
  lan-reader [文件夹] [选项]
  lan-reader list
  lan-reader stop [端口或文件夹]
  lan-reader check-update
  lan-reader version
  lan-reader help

命令：
  list                  显示这台电脑上运行中的书架
  stop                  停止全部书架，或按端口/文件夹停止一个书架
  check-update          立即检查是否有新版本
  version               显示当前安装的版本
  help                  显示帮助

选项：
  -r, --root <文件夹>   要阅读的文件夹，默认是当前目录
  -p, --port <端口>     起始端口，默认 8080；被占用时自动递增
      --host <地址>     监听地址，默认 0.0.0.0
      --protect         生成临时访问码保护书架
      --foreground      在当前终端前台运行
  -v, --version         显示当前安装的版本
  -h, --help            显示帮助

示例：
  lan-reader
  lan-reader --protect --port 9090
  lan-reader list
  lan-reader stop
`.trim();
