export function parseArguments(argv, defaults = {}) {
  const options = {
    root: defaults.root ?? process.cwd(),
    host: defaults.host ?? "0.0.0.0",
    port: defaults.port ?? 8080,
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
  npm start -- [文件夹] [选项]
  lan-reader [文件夹] [选项]
  lan-reader stop

命令：
  stop                  一键停止这台电脑上的全部书架服务

选项：
  -r, --root <文件夹>   要阅读的文件夹，默认是当前目录
  -p, --port <端口>     服务端口，默认 8080
      --host <地址>     监听地址，默认 0.0.0.0
  -h, --help            显示帮助
`.trim();
