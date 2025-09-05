const webpack = require('webpack');

module.exports = {
  resolve: {
    fallback: {
      // Node.js built-in modules that need to be polyfilled or ignored for browser
      "util": require.resolve("util"),
      "stream": require.resolve("stream-browserify"),
      "os": require.resolve("os-browserify/browser"),
      "child_process": false,
      "fs": false,
      "crypto": require.resolve("crypto-browserify"),
      "path": require.resolve("path-browserify"),
      "url": require.resolve("url"),
      "buffer": require.resolve("buffer"),
      "process": require.resolve("process/browser"),
      "assert": require.resolve("assert"),
      "http": require.resolve("stream-http"),
      "https": require.resolve("https-browserify"),
      "zlib": require.resolve("browserify-zlib"),
      "querystring": require.resolve("querystring-es3"),
      "net": false,
      "tls": false,
      "dns": false,
      "timers": require.resolve("timers-browserify"),
      "vm": require.resolve("vm-browserify"),
      "constants": require.resolve("constants-browserify"),
      "events": require.resolve("events")
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
  ],
  module: {
    rules: [
      {
        // Handle .node files (native modules) - exclude them from bundling
        test: /\.node$/,
        use: 'node-loader',
      },
      {
        // Ignore certain problematic modules
        test: /sharp/,
        use: 'null-loader',
      },
    ],
  },
  externals: {
    // Mark certain modules as external to avoid bundling them
    'onnxruntime-node': 'commonjs onnxruntime-node',
    'sharp': 'commonjs sharp',
  },
  ignoreWarnings: [
    /Critical dependency: the request of a dependency is an expression/,
    /Module not found: Error: Can't resolve/
  ]
};
