import { type Config } from "prettier";

const config: Config = {
    tabWidth: 4,
    printWidth: 120,
    semi: true,
    endOfLine: "lf",
    quoteProps: "consistent",
    trailingComma: "all",
    bracketSameLine: true,
    arrowParens: "avoid",
    htmlWhitespaceSensitivity: "strict",
    singleAttributePerLine: true,
};

export default config;
