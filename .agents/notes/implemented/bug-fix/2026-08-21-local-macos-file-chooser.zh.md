# Agent Note: 本地 macOS 文件选择器

Status: implemented

[English](2026-08-21-local-macos-file-chooser.md) | 中文

## Problem

已安装的 macOS 应用在 `WKWebView` 中嵌入 Web 客户端。附件控件可以发起网页文件输入请求，但未设置 `WKUIDelegate` 的视图不会显示原生选择器，因此该控件看起来没有响应。

## Decision

原生包装层持有 `WKWebView` UI delegate，并把每次网页文件输入请求转换成 `NSOpenPanel`。Web 视图窗口可用时，面板附着在该窗口上；它遵循 WebKit 的目录选择与多选标志，确认后返回所选 URL，取消后返回 `nil`。

Web 附件实现继续负责校验、接收、预览和提交。包装层只提供操作系统文件选择界面。

## Alternatives considered

**注入 JavaScript 文件选择器。** 未采用，因为 JavaScript 仍然依赖宿主 Web 视图显示操作系统选择器，无法修复缺少原生 delegate 的问题。

**另建原生上传流程。** 未采用，因为这会重复 Web 客户端的附件校验与生命周期，而不是完成现有文件输入请求。

## Consequences

点击已安装应用中的附件控件会打开 macOS 文件选择器，选择文件或取消都会完成等待中的 WebKit 请求。包装层不会重新解释可接受的文件类型，也不会自行上传数据；选择完成后仍由 Web 客户端负责后续处理。
