export function parseArguments(argv, defaults = {}) {
  const options = {
    root: defaults.root ?? process.cwd(),
    host: defaults.host ?? "0.0.0.0",
    port: defaults.port ?? 8080,
    protect: defaults.protect ?? false,
    help: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--root" || argument === "-r") {
      options.root = argv[++index];
    } else if (argument === "--port" || argument === "-p") {
      options.port = Number(argv[++index]);
    } else if (argument === "--host") {
      options.host = argv[++index];
    } else if (argument === "--protect") {
      options.protect = true;
    } else if (argument.startsWith("-")) {
      throw new Error(`未知参数：${argument}`);
    } else {
      positional.push(argument);
    }
  }

  if (positional[0]) options.root = positional[0];
  if (!options.root) throw new Error("请提供要阅读的文件夹");
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error("端口必须是 0 到 65535 之间的整数");
  }
  return options;
}

export const HELP_TEXT = `
局域网书架

用法：
  lan-reader [文件夹] [选项]
  lan-reader list
  lan-reader stop [端口或文件夹]

命令：
  list                  显示这台电脑上运行中的书架
  stop                  停止全部书架，或按端口/文件夹停止一个书架

选项：
  -r, --root <文件夹>   要阅读的文件夹，默认是当前目录
  -p, --port <端口>     起始端口，默认 8080；被占用时自动递增
      --host <地址>     监听地址，默认 0.0.0.0
      --protect         生成临时访问码保护书架
  -h, --help            显示帮助
`.trim();
