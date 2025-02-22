const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: {
    popup: './src/popup.js'
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist')
  },
  optimization: {
    minimize: false  // Disable minification for now
  },
  resolve: {
    extensions: ['.js'],
    alias: {
      '@mozilla/readability': path.resolve(__dirname, 'node_modules/@mozilla/readability/Readability.js')
    }
  },
  mode: 'development'
}; 