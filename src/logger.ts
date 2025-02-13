import { createLogger, format, transports } from "winston";
import { config } from "./config";
import * as ansis from "ansis";

type ColorName = "red" | "yellow" | "green" | "magenta";
type LogLevel = "error" | "warning" | "info" | "debug";

const colors = {
  error: "red",
  warning: "yellow",
  info: "green",
  debug: "magenta",
};

export const logger = createLogger({
  level: config.LOG_LEVEL,
  levels: {
    error: 0,
    warning: 1,
    info: 2,
    debug: 3,
  },
  transports: [
    new transports.Console({
      format: format.combine(
        format.prettyPrint(),
        format.splat(),
        format.timestamp(),
        format.printf((info) => {
          const color = colors[info.level as LogLevel];
          const levelColor = ansis[color as ColorName];
          const formatted = [
            `${info.timestamp}`,
            levelColor.bold(info.level.toUpperCase()),
            " ".repeat(8 - info.level.length),
            config.NODE_ENV == "dev" && info.stack
              ? levelColor(
                  `${info.message}${(info.stack as string[]).join("\n")}`
                )
              : levelColor(info.message),
          ];

          return formatted.filter((f) => f).join(" ");
        })
      ),
    }),
  ],
});
