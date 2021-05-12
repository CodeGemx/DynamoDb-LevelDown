import path from "path";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
    entry: "./src/index.ts",
    mode: "production",
    target: "node",
    module: {
        rules: [
          {
            test: /\.ts$/,
            use: [
              'ts-loader',
            ]
          }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        filename: "index.js",
        path: path.resolve(__dirname, 'dist'),
    }
}