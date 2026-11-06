import { parseEnvironment } from "./environment";

export const register = () => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    parseEnvironment(process.env);
  }
};
