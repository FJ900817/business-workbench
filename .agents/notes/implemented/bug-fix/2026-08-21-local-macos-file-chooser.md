# Agent Note: Local macOS file chooser

Status: implemented

English | [中文](2026-08-21-local-macos-file-chooser.zh.md)

## Problem

The installed macOS application embeds the Web client in `WKWebView`. The attachment control can issue a Web file-input request, but a view without a `WKUIDelegate` does not present a native picker, so the control appears to do nothing.

## Decision

The native wrapper owns the `WKWebView` UI delegate and translates each Web file-input request into an `NSOpenPanel`. The panel is attached to the Web view's window when available, follows WebKit's directory and multiple-selection flags, returns selected URLs after confirmation, and returns `nil` after cancellation.

The Web attachment implementation continues to own validation, intake, previews, and submission. The wrapper supplies only the operating-system selection surface.

## Alternatives considered

**Inject a JavaScript file picker.** Rejected because JavaScript still depends on the host Web view to present the operating-system picker and cannot repair a missing native delegate.

**Build a separate native upload pipeline.** Rejected because it would duplicate the Web client's attachment validation and lifecycle instead of completing the existing file-input request.

## Consequences

Clicking the attachment control in the installed application opens the macOS file chooser, and either choosing files or cancelling completes the pending WebKit request. The wrapper does not reinterpret accepted file types or upload data itself; the Web client remains authoritative after selection.
