import { createDraft, buildSubmission, fingerprint, valueField, pairRow, replaceField, keepField } from './form-model.js';

window.__ModuleLoader__.load({
  id: '@local/dsh-mcp-manager-ui',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useSyncExternalStore } = React;
    const NS = 'local.mcpManager', PANEL = 'local-mcp-servers';
    const en = {
      onDemand: 'Load tools on demand', nativeOAuth: 'Edit this OAuth connection in native DSH settings.', 'waiting-authorization': 'Awaiting authorization',
      'error.native-oauth': 'Edit this OAuth connection in native DSH settings.', 'error.unsupported-tool-loading': 'This host does not expose tool loading in MCP settings.',
      title: 'MCP servers', intro: 'Add a connection using fields, not configuration code. Changes apply to every session in this profile.',
      add: 'Add server', refresh: 'Refresh', close: 'Back to chat', empty: 'No MCP servers yet', emptyHelp: 'Add a remote HTTP endpoint or a local command to get started.', loading: 'Loading…', retry: 'Could not load servers. Try Refresh.',
      connected: 'Connected', disabled: 'Disabled', connecting: 'Connecting', reconnecting: 'Reconnecting', failed: 'Connection failed', closed: 'Closed', 'waiting-credentials': 'Waiting for credentials', tools: 'tools',
      edit: 'Edit', enable: 'Enable', disable: 'Disable', probe: 'Test connection', restart: 'Reconnect', remove: 'Delete', reset: 'Reset override', inherited: 'Inherited', plugin: 'Plugin-owned · read-only configuration', source: 'Configuration source', user: 'User configuration', retained: 'Transport cleanup incomplete · restart DSH',
      newTitle: 'Add MCP server', editTitle: 'Edit MCP server', name: 'Name', note: 'Note', nameHint: '1–32 letters, digits, underscores or hyphens. The name cannot change while editing.', noteHint: 'Optional description, up to 500 characters. Stored separately from the MCP configuration; do not put secrets here.', namePlaceholder: 'my-server', notePlaceholder: 'What is this connection used for?',
      required: 'Required', optional: 'Optional', transport: 'Connection type', http: 'HTTP', stdio: 'Local command', sse: 'SSE · unavailable', sseHint: 'This DSH version supports stdio and streamable HTTP only. Legacy SSE endpoints cannot be used here.', httpHint: 'Use a streamable HTTP MCP endpoint. Headers are sent only to this endpoint.', stdioHint: 'Run one executable with a separate row for each argument. No shell parsing or automatic quote removal.',
      url: 'Endpoint URL', urlPlaceholder: 'https://example.com/mcp or ${credential:MCP_URL}', urlHint: 'HTTP(S) is required. Credential references may replace the URL or parts of it; URL usernames/passwords are not allowed.', command: 'Program / executable', commandPlaceholder: 'npx, node or C:\\Program Files\\MCP\\server.exe', commandHint: 'Only the program or executable path, without enclosing quotes. Put options and script paths in Arguments below.', cwd: 'Working directory', cwdPlaceholder: 'C:\\Projects\\my-mcp (blank: DSH process working directory)',
      args: 'Arguments', arg: 'Argument', argPlaceholder: 'One argument, e.g. -y or @modelcontextprotocol/server-everything', argsHint: 'Each row is exactly one argument. Do not paste a quoted shell command or a quoted argument list; paths with spaces need no enclosing quotes. Blank rows are ignored.', addArg: 'Add argument', removeArg: 'Remove argument',
      headers: 'HTTP headers', env: 'Environment variables', key: 'Name', value: 'Value', headerKey: 'Authorization or X-API-Key', headerValue: 'Bearer ${credential:MCP_TOKEN}', envKey: 'API_KEY or MCP_HOME', envValue: '${credential:MCP_TOKEN} or a non-secret value', addHeader: 'Add header', addEnv: 'Add environment variable', removeRow: 'Remove row', headerHint: 'Header names are case-insensitive RFC tokens. Each non-empty row needs both a name and a value.', envHint: 'Use letters, digits and underscores; start with a letter or underscore. Names must be unique (case-insensitive on Windows). Both name and value are required per non-empty row.',
      enabled: 'Enable connection after saving', enabledHint: 'New servers are disabled by default. Enabling a local command starts a program; HTTP may send the configured headers. Only use servers you trust.',
      advanced: 'Advanced settings', advancedHint: 'All values are optional. Empty fields use DSH defaults; time values are in seconds.', startupTimeout: 'Startup timeout', toolCallTimeout: 'Tool-call timeout', closeTimeout: 'Close timeout', seconds30: 'Default: 30 seconds', seconds60: 'Default: 60 seconds', seconds5: 'Default: 5 seconds', reconnectEnabled: 'Automatically reconnect', reconnectHint: 'Enabled by default. Off: new delay/attempt drafts are ignored, existing stored values are preserved. Turn on to apply or edit these fields.', initialDelay: 'Initial reconnect delay', maxDelay: 'Maximum reconnect delay', maxAttempts: 'Maximum reconnect attempts', secondsHalf: 'Default: 0.5 seconds', attempts10: 'Default: 10 attempts',
      keep: 'Keep stored value', replace: 'Replace', deleteValue: 'Clear value', undoReplace: 'Keep original instead', keptHint: 'The stored value is hidden and will be retained if left unchanged. Replace or clear it explicitly; no credential values are read.', maskedArgs: 'Hidden argument values can be kept only at their original positions. If you remove earlier arguments, explicitly replace or remove any affected hidden values.', maskedChanged: 'To change transport, replace or clear hidden fields in that transport first. Hidden values cannot move between connection types.',
      secret: 'Use ${credential:REF} for secrets. This form never reads credential values or creates credential records. Newly entered literal secrets are saved as literals in your profile.',
      preview: 'Check & preview', save: 'Save server', previewTitle: 'Read-only configuration preview', previewHint: 'Optional technical preview; you only need to fill the fields above.', literal: 'Possible literal secrets were detected. They are masked in this preview but would be saved as entered. Prefer credential references.', cancel: 'Cancel', busy: 'Working…', saved: 'Server and note saved. This does not mean the connection succeeded; check its status separately.', partialSaved: 'Server configuration was saved, but the note was not saved. Retry the note separately below; do not resubmit the server configuration.', noteRetry: 'Retry note save', notePending: 'Unsaved note for', noteSaved: 'Note saved.', noteConflict: 'Refresh to obtain the latest note revision before retrying. Your unsaved note is retained.', warnings: 'Not all requested changes completed', noteSaveFailed: 'The server configuration was saved, but its note could not be saved.', cleanupFailed: 'The server was removed, but its stored note could not be cleaned up.', overwrite: 'Replace the existing server with this name', overwriteHint: 'This name already exists. Replacement is never automatic; edit the existing row instead if it has hidden values.',
      changed: 'Configuration saved and applied. Connection status is separate.', testGood: 'MCP handshake and tool discovery succeeded.', testBad: 'Connection test failed.', cleanup: 'Transport cleanup was not confirmed. Restart DSH before trying again.', result: 'Connection test result', noTools: 'No tools reported', deleteConfirm: 'Delete this server configuration?', resetConfirm: 'Restore this server’s inherited configuration?', yes: 'Confirm', no: 'Cancel', statusHint: 'Status is a snapshot. Refresh after connecting or reconnecting. Test connection may start a local program.', discard: 'Discard your unsaved changes? Cancel to keep editing.', pendingDiscard: 'A note still needs to be saved. Leave this page anyway? The retry will remain available while this panel is mounted.', validation: 'Check the highlighted fields. Your input has not been submitted.', conflictHint: 'Your draft has been kept. Configuration changed elsewhere: refresh the list, then cancel and reopen the editor to review the latest values.',
      'v.name': 'Use 1–32 letters, digits, underscores or hyphens; reserved object keys are not allowed.', 'v.rename': 'Renaming an existing server is not supported. Create a new server explicitly.', 'v.note': 'Keep the note at 500 characters or fewer.', 'v.transport': 'Choose HTTP or Local command. Legacy SSE is unsupported.', 'v.maskedMoved': 'This hidden value cannot be kept at a changed path, argument position or transport. Replace or remove it explicitly.', 'v.marker': 'Do not type a redaction marker. Use Keep stored value for existing hidden values.', 'v.template': 'Use a valid reference such as ${credential:MCP_TOKEN}.', 'v.partialKey': 'Enter a name, or remove this row.', 'v.partialValue': 'Enter a value, or remove this row.', 'v.headerName': 'Use a valid RFC header-name token without spaces or colons.', 'v.envName': 'Start with a letter or underscore; use only letters, digits and underscores.', 'v.duplicate': 'This name duplicates another row.', 'v.headerValue': 'Header values must not contain line breaks.', 'v.urlRequired': 'Enter the MCP endpoint URL.', 'v.url': 'Enter a valid HTTP(S) URL without username or password, or a credential reference.', 'v.commandRequired': 'Enter the executable, not a complete shell command.', 'v.commandShell': 'Enter just the executable path without enclosing quotes. Put each argument in its own row.', 'v.argumentShell': 'Remove enclosing shell quotes. Each row already represents one argument; do not paste a quoted command string.', 'v.argumentLine': 'Use one argument per row, without line breaks.', 'v.seconds': 'Enter positive seconds (at least 0.001, at most 2147483.647).', 'v.attempts': 'Enter a positive whole number of attempts.', 'v.initialMax': 'Initial reconnect delay must not exceed maximum delay (default maximum: 30 seconds).',
      notesUnavailable: 'Note storage is temporarily unavailable. You may save only the connection configuration; existing notes will not be cleared.', savedNoNote: 'Connection configuration saved; the note was not changed. Check connection status separately.',
      'v.secretTarget': 'The target or execution context changed. Replace retained sensitive values with credential references before saving.', 'error.secret-target-changed': 'The target changed. Replace retained sensitive values with credential references before saving.', 'error.note-conflict': 'Notes changed elsewhere. Refresh before retrying; your unsaved note is retained.',
      'error.invalid-input': 'Invalid configuration. Check the fields and the reason below.', 'error.conflict': 'Configuration changed elsewhere. Your draft is kept; refresh and reopen to review the latest values.', 'error.exists': 'This name already exists. Edit that row or explicitly allow replacement.', 'error.unavailable': 'Native MCP configuration is unavailable in this profile.', 'error.operation-failed': 'DSH refused the operation. Check configuration and connection status.', 'error.not-found': 'Server or operation not found.', 'error.forbidden': 'This action requires owner access.',
    };
    const zh = {
      onDemand: '按需加载工具', nativeOAuth: '请在 DSH 原生设置中编辑此 OAuth 连接。', 'waiting-authorization': '等待授权',
      'error.native-oauth': '请在 DSH 原生设置中编辑此 OAuth 连接。', 'error.unsupported-tool-loading': '当前宿主的 MCP 设置不支持工具加载方式。',
      title: 'MCP 服务器', intro: '逐项填写连接信息，无需输入配置代码。修改对当前 profile 的所有会话生效。',
      add: '添加服务器', refresh: '刷新', close: '返回聊天', empty: '还没有 MCP 服务器', emptyHelp: '添加远程 HTTP 地址或本地命令即可开始使用。', loading: '正在加载…', retry: '无法加载服务器，请刷新重试。',
      connected: '已连接', disabled: '已停用', connecting: '连接中', reconnecting: '重新连接中', failed: '连接失败', closed: '已关闭', 'waiting-credentials': '等待凭据', tools: '个工具',
      edit: '编辑', enable: '启用', disable: '停用', probe: '测试连接', restart: '重新连接', remove: '删除', reset: '恢复继承配置', inherited: '继承配置', plugin: '由其他插件管理 · 配置只读', source: '配置来源', user: '用户配置', retained: '连接清理未完成 · 请重启 DSH',
      newTitle: '添加 MCP 服务器', editTitle: '编辑 MCP 服务器', name: '名称', note: '备注', nameHint: '1–32 位字母、数字、下划线或连字符。编辑已有服务器时名称不可修改。', noteHint: '选填，最多 500 字；与 MCP 配置分开保存，请勿填写密钥。', namePlaceholder: 'my-server', notePlaceholder: '描述这条连接的用途，方便以后辨认',
      required: '必填', optional: '选填', transport: '连接方式', http: 'HTTP', stdio: '本地命令', sse: 'SSE · 暂不支持', sseHint: '当前 DSH 仅支持 stdio 和 Streamable HTTP，不支持旧式 SSE 地址；此选项不可用。', httpHint: '填写 Streamable HTTP MCP 地址，请求头仅发送到该端点。', stdioHint: '程序与参数分开填写，每行一个参数；不会按 shell 规则解析或自动去除引号。',
      url: '端点 URL', urlPlaceholder: 'https://example.com/mcp 或 ${credential:MCP_URL}', urlHint: '必须是 HTTP(S)。可将整个 URL 或其中一部分写为凭据引用；URL 不得包含用户名或密码。', command: '程序／可执行文件', commandPlaceholder: 'npx、node 或 C:\\Program Files\\MCP\\server.exe', commandHint: '只填程序名或可执行文件路径，不加外围引号。选项与脚本路径请逐项填入下方参数。', cwd: '工作目录', cwdPlaceholder: 'C:\\Projects\\my-mcp（留空：使用 DSH 进程工作目录）',
      args: '参数', arg: '参数', argPlaceholder: '一个参数，例如 -y 或 @modelcontextprotocol/server-everything', argsHint: '每行就是一个参数，勿粘贴带外围引号的整段 shell 命令或参数串；带空格的路径也无需外围引号。空白行会忽略。', addArg: '添加参数', removeArg: '删除参数',
      headers: 'HTTP 请求头', env: '环境变量', key: '名称', value: '值', headerKey: 'Authorization 或 X-API-Key', headerValue: 'Bearer ${credential:MCP_TOKEN}', envKey: 'API_KEY 或 MCP_HOME', envValue: '${credential:MCP_TOKEN} 或非敏感值', addHeader: '添加请求头', addEnv: '添加环境变量', removeRow: '删除此行', headerHint: '请求头名称不区分大小写，须符合 RFC token；非空行的名称和值都必须填写。', envHint: '名称以字母或下划线开头，仅含字母、数字和下划线。名称必须唯一（Windows 不区分大小写）；非空行的名称和值都必须填写。',
      enabled: '保存后启用连接', enabledHint: '新建默认停用。启用本地命令会运行程序；HTTP 会发送所填请求头。请仅使用可信服务器。',
      advanced: '高级设置', advancedHint: '全部选填；留空采用 DSH 默认值。时间单位为秒。', startupTimeout: '启动超时', toolCallTimeout: '工具调用超时', closeTimeout: '关闭超时', seconds30: '默认：30 秒', seconds60: '默认：60 秒', seconds5: '默认：5 秒', reconnectEnabled: '自动重新连接', reconnectHint: '默认开启。关闭时忽略新输入的延迟／次数草稿，保留原已存值；重新开启后才会应用或校验这些字段。', initialDelay: '首次重连延迟', maxDelay: '最大重连延迟', maxAttempts: '最多重连次数', secondsHalf: '默认：0.5 秒', attempts10: '默认：10 次',
      keep: '保留已存值', replace: '替换', deleteValue: '清空此值', undoReplace: '改为保留原值', keptHint: '已存值被隐藏；保持此状态即可保留。请显式替换或清空，不会读取凭据内容。', maskedArgs: '隐藏的参数只能在原位置保留。删除前面的参数后，请显式替换或删除位置发生变化的隐藏参数。', maskedChanged: '切换连接方式后，原隐藏值不能跨传输方式保留；请显式替换或清空。',
      secret: '密钥建议使用 ${credential:REF}。本表单不读取凭据内容，也不新建凭据记录。新输入的明文密钥会原样保存到 profile。',
      preview: '校验并预览', save: '保存服务器', previewTitle: '只读配置预览', previewHint: '可选的技术预览，无需理解代码；只填写上方字段即可。', literal: '检测到可能的明文密钥。此预览已遮盖，但保存时仍会原样写入；建议改用凭据引用。', cancel: '取消', busy: '处理中…', saved: '服务器配置与备注已保存。保存成功不等于连接成功，请另行查看连接状态。', partialSaved: '服务器配置已保存，但备注保存失败。请在下方单独重试备注，不要重复提交服务器配置。', noteRetry: '重试保存备注', notePending: '待保存备注：', noteSaved: '备注已保存。', noteConflict: '请先刷新获取最新备注版本，再重试；未保存备注会保留。', warnings: '部分操作未完成', noteSaveFailed: '服务器配置已保存，但备注保存失败。', cleanupFailed: '服务器已移除，但其备注清理失败。', overwrite: '替换现有同名服务器', overwriteHint: '该名称已存在，绝不会自动覆盖。如果旧配置含隐藏值，请改为编辑对应条目。',
      changed: '配置已保存并应用；连接状态请另行查看。', testGood: 'MCP 握手与工具发现成功。', testBad: '连接测试失败。', cleanup: '未确认连接已完整关闭，请重启 DSH 后再试。', result: '连接测试结果', noTools: '未报告工具', deleteConfirm: '确定删除这台服务器的配置？', resetConfirm: '确定恢复这台服务器的继承配置？', yes: '确认', no: '取消', statusHint: '连接状态为快照，连接或重连后请刷新。测试连接可能启动本地程序。', discard: '要放弃尚未保存的修改吗？选择取消可继续编辑并保留输入。', pendingDiscard: '仍有备注尚未保存，确定离开吗？面板未卸载时仍可重试。', validation: '请检查标出的字段，尚未提交任何输入。', conflictHint: '草稿已保留。配置已在其他位置更新，请刷新列表，然后取消并重新打开编辑器以核对最新配置。',
      'v.name': '请输入 1–32 位字母、数字、下划线或连字符，不可使用保留对象键。', 'v.rename': '不支持隐式重命名，请明确新建另一台服务器。', 'v.note': '备注不得超过 500 字。', 'v.transport': '请选择 HTTP 或本地命令；不支持旧式 SSE。', 'v.maskedMoved': '此隐藏值的位置、参数序号或连接方式已变更，不能直接保留；请显式替换或删除。', 'v.marker': '请勿手动输入遮盖标记；原隐藏值请使用“保留已存值”。', 'v.template': '请使用有效凭据引用，例如 ${credential:MCP_TOKEN}。', 'v.partialKey': '请填写名称，或删除此行。', 'v.partialValue': '请填写值，或删除此行。', 'v.headerName': '请求头名称须符合 RFC token，不可含空格或冒号。', 'v.envName': '须以字母或下划线开头，且仅含字母、数字和下划线。', 'v.duplicate': '此名称与另一行重复。', 'v.headerValue': '请求头值不能包含换行。', 'v.urlRequired': '请填写 MCP 端点 URL。', 'v.url': '请填写有效 HTTP(S) URL（不含用户名、密码），或使用凭据引用。', 'v.commandRequired': '请填写可执行程序，而非整段 shell 命令。', 'v.commandShell': '只填可执行文件路径，不加外围引号；参数请逐行另填。', 'v.argumentShell': '请去除外围 shell 引号。每行已经是一个参数，不要填带引号的整段命令。', 'v.argumentLine': '请逐行添加参数，单个参数内不要换行。', 'v.seconds': '请输入正数秒（最少 0.001，最多 2147483.647）。', 'v.attempts': '请输入正整数次数。', 'v.initialMax': '首次重连延迟不得大于最大延迟（默认最大 30 秒）。',
      notesUnavailable: '备注存储暂不可用；可只保存连接配置，不会清空已有备注。', savedNoNote: '连接配置已保存（备注未修改）。请另行查看连接状态。',
      'v.secretTarget': '目标或执行上下文已改变，请将保留的敏感值替换为凭据引用后再保存。', 'error.secret-target-changed': '目标已改变，请将保留的敏感值替换为凭据引用后再保存。', 'error.note-conflict': '备注已在其他位置更新，请刷新后再重试；未保存备注已保留。',
      'error.invalid-input': '配置无效，请检查字段及下方原因。', 'error.conflict': '配置已在其他位置更新。草稿已保留，请刷新并重新打开编辑器核对。', 'error.exists': '名称已存在，请编辑该条目或明确允许替换。', 'error.unavailable': '当前 profile 无法编辑原生 MCP 配置。', 'error.operation-failed': 'DSH 拒绝了操作，请检查配置和连接状态。', 'error.not-found': '未找到服务器或操作。', 'error.forbidden': '此操作需要所有者权限。',
    };
    const css = `
.lmcp-page{height:100%;min-height:0;overflow:auto;box-sizing:border-box;padding:28px clamp(18px,4vw,48px) 48px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.55}.lmcp-inner{max-width:960px;margin:auto}.lmcp-head,.lmcp-row-head,.lmcp-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.lmcp-head{justify-content:space-between;margin-bottom:24px}.lmcp-page h1{font-size:20px;font-weight:500;line-height:28px;margin:0}.lmcp-page h2{font-size:16px;margin:0}.lmcp-page h3{font-size:14px;margin:0}.lmcp-muted{color:var(--dsw-alias-label-secondary);font-size:13px}.lmcp-intro{margin:5px 0 0;max-width:650px}.lmcp-list{display:grid;gap:12px}.lmcp-card,.lmcp-editor{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:14px;padding:20px;min-width:0}.lmcp-card{display:grid;gap:10px}.lmcp-row-head{justify-content:space-between}.lmcp-name{font-size:15px;font-weight:500;overflow-wrap:anywhere}.lmcp-badge{display:inline-flex;gap:6px;align-items:center;font-size:12px;color:var(--dsw-alias-label-secondary)}.lmcp-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}.lmcp-dot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}.lmcp-dot[data-state=failed]{background:var(--dsw-alias-state-error-primary)}.lmcp-dot[data-state=connecting],.lmcp-dot[data-state=reconnecting]{background:var(--dsw-alias-state-warn-primary)}
.lmcp-page button{font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 12px;min-height:36px}.lmcp-page button:disabled{opacity:.5;cursor:default}.lmcp-page button.lmcp-primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);border-color:var(--dsw-alias-brand-primary)}.lmcp-page button.lmcp-danger{color:var(--dsw-alias-state-error-primary)}.lmcp-page :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}.lmcp-page input[type=text],.lmcp-page input[type=number],.lmcp-page textarea{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;padding:9px 11px}.lmcp-page input:disabled{opacity:.55}.lmcp-page input:read-only{background:var(--dsw-alias-bg-layer-2)}.lmcp-page textarea{resize:vertical;min-height:72px;line-height:1.6}.lmcp-page [aria-invalid=true]{border-color:var(--dsw-alias-state-error-primary)!important}.lmcp-editor{margin:0 0 24px;display:grid;gap:20px}.lmcp-field{display:grid;gap:6px;min-width:0}.lmcp-label{display:flex;align-items:baseline;gap:8px;font-weight:500}.lmcp-tag{font-size:11px;font-weight:400;color:var(--dsw-alias-label-secondary)}.lmcp-check{display:flex;gap:8px;align-items:center}.lmcp-check input,.lmcp-segment input{accent-color:var(--dsw-alias-brand-primary)}.lmcp-check input{width:17px;height:17px}.lmcp-notice{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2);font-size:13px;overflow-wrap:anywhere;margin-bottom:14px}.lmcp-notice[data-error=true],.lmcp-error{color:var(--dsw-alias-state-error-primary)}.lmcp-notice[data-warning=true]{color:var(--dsw-alias-state-warn-primary)}.lmcp-error{font-size:13px;margin:0}.lmcp-page pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);padding:14px;border-radius:8px;font:12px/1.65 ui-monospace,Consolas,monospace;max-height:340px;overflow:auto}.lmcp-empty{text-align:center;padding:44px 20px;border:1px dashed var(--dsw-alias-border-l2);border-radius:14px}.lmcp-confirm{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:8px}.lmcp-endpoint{overflow-wrap:anywhere;margin:0}.lmcp-footnote{margin-top:24px}.lmcp-page fieldset{padding:0;border:0;margin:0;min-width:0}.lmcp-page legend{margin-bottom:8px}.lmcp-segments{display:flex;flex-wrap:wrap;gap:4px;padding:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base)}.lmcp-segment{display:flex;gap:8px;align-items:center;flex:1;min-width:125px;padding:9px 12px;border-radius:7px;cursor:pointer}.lmcp-segment[data-selected=true]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}.lmcp-segment[data-disabled=true]{color:var(--dsw-alias-label-secondary);cursor:not-allowed}.lmcp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.lmcp-pairs,.lmcp-args{display:grid;gap:12px}.lmcp-pair{display:grid;grid-template-columns:minmax(130px,1fr) minmax(170px,1.5fr) auto;gap:10px;align-items:start;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}.lmcp-arg{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start}.lmcp-row-delete{margin-top:28px}.lmcp-section{display:grid;gap:12px}.lmcp-page summary{cursor:pointer;font-weight:500;padding:4px 0}.lmcp-detail-body{padding-top:14px;display:grid;gap:16px}.lmcp-mask{border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;padding:9px 11px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.lmcp-mask span{flex:1;min-width:100px}.lmcp-mask button{min-height:30px;padding:3px 9px}.lmcp-inline-buttons{display:flex;gap:8px;flex-wrap:wrap}.lmcp-note{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.lmcp-form-actions{border-top:1px solid var(--dsw-alias-border-l1);padding-top:18px}.lmcp-page p{margin-top:0}.lmcp-section>p{margin-bottom:0}@media(max-width:640px){.lmcp-grid{grid-template-columns:1fr}.lmcp-pair{grid-template-columns:1fr}.lmcp-row-delete{margin-top:0;justify-self:start}.lmcp-card,.lmcp-editor{padding:16px}.lmcp-page{padding:20px 16px 36px}.lmcp-segment{min-width:110px}}
`;
    function ServerIcon({ size = 20 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('rect', { x: 4, y: 3, width: 16, height: 6, rx: 2 }), h('rect', { x: 4, y: 13, width: 16, height: 6, rx: 2 }), h('path', { d: 'M8 6h.01M8 16h.01M12 9v4m0 6v2m-4 0h8' }));
    }
    return {
      inject: ['slots', 'locale', 'connection', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }));
        const t = ctx.locale.bind(NS);
        async function call(payload, signal) {
          const result = await ctx.connection.rpc.call('/api', 'local-mcp-manager', payload, signal);
          if (!result.ok) {
            const key = `error.${result.error.code}`;
            const error = new Error(t(Object.prototype.hasOwnProperty.call(en, key) ? key : 'error.operation-failed') + (result.error.code === 'invalid-input' ? `\n${result.error.message}` : ''));
            error.code = result.error.code;
            throw error;
          }
          return result.value;
        }
        // In-memory only: retain drafts and note retries when another sidebar panel unmounts this page.
        const pageCache = { draft: null, baseline: '', preview: null, validated: false, overwrite: false, advancedOpen: false, pendingNotes: [] };
        function Page() {
          useSyncExternalStore(cb => ctx.locale.subscribe(cb), () => ctx.locale.getSnapshot());
          const [data, setData] = useState(null), [busy, setBusy] = useState(true), [notice, setNotice] = useState(null);
          const [draft, setDraft] = useState(() => pageCache.draft), [baseline, setBaseline] = useState(() => pageCache.baseline), [preview, setPreview] = useState(() => pageCache.preview);
          const [validated, setValidated] = useState(() => pageCache.validated), [overwrite, setOverwrite] = useState(() => pageCache.overwrite), [advancedOpen, setAdvancedOpen] = useState(() => pageCache.advancedOpen);
          const [confirm, setConfirm] = useState(null), [result, setResult] = useState(null), [pendingNotes, setPendingNotes] = useState(() => pageCache.pendingNotes), [focusTarget, setFocusTarget] = useState(null);
          const abort = useRef(null), refs = useRef({}), busyRef = useRef(true);
          const dirty = !!draft && fingerprint(draft) !== baseline;
          const model = draft ? buildSubmission(draft, { overwrite }) : null;
          const errors = validated ? model?.errors ?? {} : {};
          useEffect(() => { Object.assign(pageCache, { draft, baseline, preview, validated, overwrite, advancedOpen, pendingNotes }); });
          useEffect(() => {
            const ac = new AbortController(); abort.current = ac;
            call({ action: 'list' }, ac.signal).then(value => { if (!ac.signal.aborted) { setData(value); const cached = pageCache.draft; if (cached && (value.revision !== cached.revision || value.noteRevision !== cached.noteRevision)) setNotice({ warning: true, text: t('conflictHint') }); } }).catch(e => { if (!ac.signal.aborted) setNotice({ error: true, text: e.message }); }).finally(() => { if (!ac.signal.aborted) { setBusy(false); busyRef.current = false; } });
            return () => { ac.abort(); abort.current = null; };
          }, []);
          useEffect(() => {
            if (!focusTarget) return;
            const target = refs.current[focusTarget] ?? refs.current.name;
            target?.focus(); target?.scrollIntoView({ block: 'center', behavior: 'smooth' }); setFocusTarget(null);
          }, [focusTarget, advancedOpen, draft]);
          useEffect(() => {
            if (!dirty && !pendingNotes.length) return;
            const handler = event => { event.preventDefault(); event.returnValue = ''; };
            window.addEventListener('beforeunload', handler);
            return () => window.removeEventListener('beforeunload', handler);
          }, [dirty, pendingNotes.length]);
          async function run(operation, onSuccess) {
            if (busyRef.current) return;
            busyRef.current = true; setBusy(true); setNotice(null);
            try { const value = await call(operation, abort.current?.signal); if (abort.current?.signal.aborted !== false) return; await onSuccess(value); }
            catch (e) { if (abort.current && !abort.current.signal.aborted) setNotice({ error: true, text: e.message + (e.code === 'conflict' && draft ? `\n${t('conflictHint')}` : '') }); }
            finally { if (abort.current && !abort.current.signal.aborted) { busyRef.current = false; setBusy(false); } }
          }
          const button = (label, action, props = {}) => h('button', { type: 'button', disabled: busy, onClick: action, ...props }, label);
          const mutationButton = (label, action, props = {}) => button(label, action, { ...props, disabled: busy || !!draft || !!props.disabled });
          const bindRef = path => element => { refs.current[path] = element; };
          const id = path => `lmcp-${path.replace(/[^A-Za-z0-9_-]/g, '-')}`;
          const errorFor = path => errors[path] && h('p', { className: 'lmcp-error', id: `${id(path)}-error`, role: 'alert' }, t(`v.${errors[path]}`));
          const label = (path, text, required = false) => h('label', { htmlFor: id(path), className: 'lmcp-label' }, text, h('span', { className: 'lmcp-tag' }, t(required ? 'required' : 'optional')));
          const attrs = path => ({ id: id(path), ref: bindRef(path), 'aria-invalid': !!errors[path], 'aria-describedby': [errors[path] ? `${id(path)}-error` : '', `${id(path)}-hint`].filter(Boolean).join(' ') });
          function update(fn) { setDraft(old => fn(old)); setPreview(null); }
          function checkDiscard() { return !dirty || window.confirm(t('discard')); }
          function start(row) {
            if (!checkDiscard()) return;
            const next = createDraft(row, data ?? {});
            const pending = row && pendingNotes.find(item => item.name === row.name);
            if (pending) next.note = pending.note;
            setDraft(next); setBaseline(fingerprint(next)); setPreview(null); setValidated(false); setOverwrite(!!row); setAdvancedOpen(false); setNotice(null); setResult(null); setConfirm(null); setFocusTarget(row ? 'note' : 'name');
          }
          function cancelEditor() { if (!checkDiscard()) return; setDraft(null); setPreview(null); setValidated(false); setNotice(null); }
          function close() {
            if (!checkDiscard() || (pendingNotes.length && !window.confirm(t('pendingDiscard')))) return;
            Object.assign(pageCache, { draft: null, baseline: '', preview: null, validated: false, overwrite: false, advancedOpen: false });
            setDraft(null); setBaseline(''); setPreview(null); setValidated(false);
            ctx.layout.selectPanel(null);
          }
          function focusFirst(path) {
            if (path.startsWith('advanced.')) setAdvancedOpen(true);
            const reconnectField = ['advanced.initialDelay', 'advanced.maxDelay', 'advanced.maxAttempts'].includes(path);
            setFocusTarget(reconnectField && !draft.advanced.reconnectEnabled ? 'advanced.reconnectEnabled' : path);
          }
          function validatedRequest() {
            setValidated(true);
            if (!model.ok) { setNotice({ error: true, text: t('validation') }); focusFirst(model.firstError); return null; }
            return model.request;
          }
          function showPreview() {
            const request = validatedRequest(); if (!request) return;
            run({ action: 'preview', ...request }, value => setPreview({ ...value, fingerprint: fingerprint(draft) }));
          }
          function warningText(warnings) {
            return warnings.map(code => t(code === 'note-save-failed' ? 'noteSaveFailed' : code === 'notes-cleanup-failed' ? 'cleanupFailed' : 'warnings')).join('\n');
          }
          function acceptSnapshot(value) { setData(value.snapshot ?? value); }
          function save() {
            const request = validatedRequest(); if (!request) return;
            // A one-click save still validates server-side first; users never have to understand code.
            run({ action: 'preview', ...request }, async checked => {
              if (checked.containsLiteralSecrets) setPreview({ ...checked, fingerprint: fingerprint(draft) });
              try {
                const value = await call({ action: 'save', ...request, revision: checked.revision, noteRevision: checked.noteRevision }, abort.current?.signal);
                if (abort.current?.signal.aborted !== false) return;
                acceptSnapshot(value);
                const warnings = value.warnings ?? [];
                if (!draft.notesUnavailable && warnings.includes('note-save-failed')) {
                  setPendingNotes(old => [...old.filter(item => item.name !== draft.name), { name: draft.name, note: draft.note }]);
                  setNotice({ warning: true, text: `${t('partialSaved')}\n${warningText(warnings)}` });
                } else { if (!draft.notesUnavailable) setPendingNotes(old => old.filter(item => item.name !== draft.name)); setNotice({ warning: !!warnings.length, text: warnings.length ? warningText(warnings) : t(draft.notesUnavailable ? 'savedNoNote' : 'saved') }); }
                setDraft(null); setPreview(null); setValidated(false);
              } catch (e) {
                if (abort.current && !abort.current.signal.aborted) setNotice({ error: true, text: e.message });
              } finally { if (abort.current && !abort.current.signal.aborted) { busyRef.current = false; setBusy(false); } }
            });
          }
          function mutate(action, row, extra = {}) {
            run({ action, name: row.name, revision: data.revision, noteRevision: data.noteRevision, ...extra }, value => {
              acceptSnapshot(value); setConfirm(null); setPreview(null);
              if (action === 'remove') setPendingNotes(old => old.filter(item => item.name !== row.name));
              const warnings = value.warnings ?? []; setNotice({ warning: !!warnings.length, text: warnings.length ? warningText(warnings) : t('changed') });
            });
          }
          function fieldControl(path, text, field, change, placeholder, hint, required = false, allowClear = true) {
            const keeping = field.masked && field.mode === 'keep';
            return h('div', { className: 'lmcp-field' }, label(path, text, required),
              keeping ? h('div', { className: 'lmcp-mask', id: id(path), 'aria-describedby': `${id(path)}-hint` }, h('span', null, t('keep')), button(t('replace'), () => change(replaceField(field)), { ref: bindRef(path), 'aria-label': `${text} · ${t('replace')}` }), allowClear && button(t('deleteValue'), () => change(replaceField(field)), { 'aria-label': `${text} · ${t('deleteValue')}` })) :
                h('input', { ...attrs(path), type: 'text', value: field.value, disabled: busy, autoComplete: 'off', spellCheck: false, placeholder, onChange: e => change(replaceField(field, e.target.value)) }),
              field.masked && !keeping && button(t('undoReplace'), () => change(keepField(field)), { className: 'lmcp-muted' }),
              h('span', { className: 'lmcp-muted', id: `${id(path)}-hint` }, keeping ? t('keptHint') : hint), errorFor(path));
          }
          function pairFields(group) {
            const parent = group === 'headers' ? 'http' : 'stdio';
            const rows = draft[parent][group];
            const changeRow = (index, patch) => update(old => ({ ...old, [parent]: { ...old[parent], [group]: old[parent][group].map((row, i) => i === index ? { ...row, ...patch } : row) } }));
            return h('section', { className: 'lmcp-section', 'aria-label': t(group) }, h('h3', null, t(group), ' ', h('span', { className: 'lmcp-tag' }, t('optional'))), h('p', { className: 'lmcp-muted' }, t(group === 'headers' ? 'headerHint' : 'envHint')),
              h('div', { className: 'lmcp-pairs' }, rows.map((row, index) => {
                const path = `${group}.${index}`;
                return h('div', { className: 'lmcp-pair', key: index },
                  h('div', { className: 'lmcp-field' }, label(`${path}.key`, `${t('key')} ${index + 1}`, true), h('input', { ...attrs(`${path}.key`), type: 'text', value: row.key, disabled: busy, autoComplete: 'off', spellCheck: false, placeholder: t(group === 'headers' ? 'headerKey' : 'envKey'), onChange: e => changeRow(index, { key: e.target.value }) }), h('span', { id: `${id(`${path}.key`)}-hint`, className: 'lmcp-muted' }), errorFor(`${path}.key`)),
                  fieldControl(`${path}.value`, `${t('value')} ${index + 1}`, row.field, field => changeRow(index, { field }), t(group === 'headers' ? 'headerValue' : 'envValue'), '', true, false),
                  button(t('removeRow'), () => update(old => ({ ...old, [parent]: { ...old[parent], [group]: old[parent][group].filter((_, i) => i !== index) } })), { className: 'lmcp-row-delete', 'aria-label': `${t(group)} ${index + 1} · ${t('removeRow')}` }));
              })), h('div', null, button(t(group === 'headers' ? 'addHeader' : 'addEnv'), () => update(old => ({ ...old, [parent]: { ...old[parent], [group]: [...old[parent][group], pairRow('', '', group)] } })))));
          }
          function numericField(key, placeholder, disabled = false, integer = false) {
            const path = `advanced.${key}`;
            return h('div', { className: 'lmcp-field' }, label(path, t(key)), h('input', { ...attrs(path), type: 'number', min: integer ? 1 : 0.001, max: integer ? Number.MAX_SAFE_INTEGER : 2147483.647, step: integer ? 1 : 'any', value: draft.advanced[key], disabled: busy || disabled, placeholder: t(placeholder), onChange: e => update(old => ({ ...old, advanced: { ...old.advanced, [key]: e.target.value } })) }), h('span', { className: 'lmcp-muted', id: `${id(path)}-hint` }, t(placeholder)), errorFor(path));
          }
          const collision = draft && !draft.originalName && data?.rows.some(row => row.name === draft.name);
          return h('section', { className: 'lmcp-page', 'aria-label': t('title'), 'aria-busy': busy }, h('style', null, css), h('div', { className: 'lmcp-inner' },
            h('header', { className: 'lmcp-head' }, h('div', null, h('h1', null, t('title')), h('p', { className: 'lmcp-muted lmcp-intro' }, t('intro'))),
              h('div', { className: 'lmcp-actions' }, button(t('refresh'), () => run({ action: 'list' }, value => { setData(value); setPreview(null); if (draft && (value.revision !== draft.revision || value.noteRevision !== draft.noteRevision)) setNotice({ warning: true, text: t('conflictHint') }); })), button(t('add'), () => start(), { className: 'lmcp-primary' }), button('×', close, { title: t('close'), 'aria-label': t('close') }))),
            notice && h('div', { className: 'lmcp-notice', 'data-error': !!notice.error, 'data-warning': !!notice.warning, role: notice.error || notice.warning ? 'alert' : 'status', style: { whiteSpace: 'pre-line' } }, notice.text),
            pendingNotes.map(item => h('div', { key: item.name, className: 'lmcp-notice', 'data-warning': true, role: 'status' }, h('strong', null, t('notePending'), ' ', item.name), h('p', { className: 'lmcp-note' }, item.note || '—'), h('p', { className: 'lmcp-muted' }, t('noteConflict')), mutationButton(t('noteRetry'), () => run({ action: 'note', name: item.name, note: item.note, noteRevision: data.noteRevision }, value => { acceptSnapshot(value); setPendingNotes(old => old.filter(note => note.name !== item.name)); setNotice({ text: t('noteSaved') }); }), { disabled: !!data?.notesUnavailable }))),
            draft && h('form', { className: 'lmcp-editor', noValidate: true, onSubmit: e => { e.preventDefault(); save(); } },
              h('div', null, h('h2', null, t(draft.originalName ? 'editTitle' : 'newTitle')), h('p', { className: 'lmcp-muted', style: { marginBottom: 0 } }, draft.originalName ?? t('previewHint'))),
              h('div', { className: 'lmcp-field' }, label('name', t('name'), true), h('input', { ...attrs('name'), type: 'text', value: draft.name, readOnly: !!draft.originalName, disabled: busy, maxLength: 32, autoComplete: 'off', spellCheck: false, placeholder: t('namePlaceholder'), onChange: e => { setOverwrite(false); update(old => ({ ...old, name: e.target.value })); } }), h('span', { className: 'lmcp-muted', id: 'lmcp-name-hint' }, t('nameHint')), errorFor('name')),
              draft.notesUnavailable && h('div', { className: 'lmcp-notice', 'data-warning': true, role: 'status' }, t('notesUnavailable')),
              h('div', { className: 'lmcp-field' }, label('note', t('note')), h('textarea', { ...attrs('note'), value: draft.note, disabled: busy || draft.notesUnavailable, maxLength: 500, placeholder: t(draft.notesUnavailable ? 'notesUnavailable' : 'notePlaceholder'), onChange: e => update(old => ({ ...old, note: e.target.value })) }), h('span', { className: 'lmcp-muted', id: 'lmcp-note-hint' }, t('noteHint'), ` (${draft.note.length}/500)`), errorFor('note')),
              h('fieldset', null, h('legend', { className: 'lmcp-label' }, t('transport'), h('span', { className: 'lmcp-tag' }, t('required'))), h('div', { className: 'lmcp-segments', role: 'radiogroup', 'aria-label': t('transport'), 'aria-describedby': 'lmcp-transport-hint' }, [['stdio', 'stdio'], ['streamable-http', 'http'], ['sse', 'sse']].map(([value, text]) => h('label', { className: 'lmcp-segment', key: value, 'data-selected': draft.transport === value, 'data-disabled': value === 'sse' }, h('input', { ref: value === 'streamable-http' ? bindRef('transport') : undefined, type: 'radio', name: 'lmcp-transport', value, checked: draft.transport === value, disabled: busy || value === 'sse', 'aria-describedby': value === 'sse' ? 'lmcp-sse-hint' : 'lmcp-transport-hint', onChange: () => update(old => ({ ...old, transport: value })) }), t(text)))), h('p', { id: 'lmcp-transport-hint', className: 'lmcp-muted', style: { marginBottom: 6, marginTop: 8 } }, t(draft.transport === 'stdio' ? 'stdioHint' : 'httpHint')), h('p', { id: 'lmcp-sse-hint', className: 'lmcp-muted', style: { marginBottom: 0 } }, t('sseHint')), errorFor('transport')),
              draft.originalTransport && draft.originalTransport !== draft.transport && h('p', { className: 'lmcp-muted' }, t('maskedChanged')),
              draft.transport === 'streamable-http' && h('div', { className: 'lmcp-section' }, fieldControl('http.url', t('url'), draft.http.url, url => update(old => ({ ...old, http: { ...old.http, url } })), t('urlPlaceholder'), t('urlHint'), true), pairFields('headers')),
              draft.transport === 'stdio' && h('div', { className: 'lmcp-section' },
                fieldControl('stdio.command', t('command'), draft.stdio.command, command => update(old => ({ ...old, stdio: { ...old.stdio, command } })), t('commandPlaceholder'), t('commandHint'), true),
                h('section', { className: 'lmcp-section', 'aria-label': t('args') }, h('h3', null, t('args'), ' ', h('span', { className: 'lmcp-tag' }, t('optional'))), h('p', { className: 'lmcp-muted' }, t('argsHint')), draft.stdio.args.some(field => field.masked) && h('p', { className: 'lmcp-muted' }, t('maskedArgs')),
                  h('div', { className: 'lmcp-args' }, draft.stdio.args.map((field, index) => h('div', { key: index, className: 'lmcp-arg' }, fieldControl(`stdio.args.${index}`, `${t('arg')} ${index + 1}`, field, next => update(old => ({ ...old, stdio: { ...old.stdio, args: old.stdio.args.map((arg, i) => i === index ? next : arg) } })), t('argPlaceholder'), ''), button(t('removeArg'), () => update(old => ({ ...old, stdio: { ...old.stdio, args: old.stdio.args.filter((_, i) => i !== index) } })), { className: 'lmcp-row-delete', 'aria-label': `${t('arg')} ${index + 1} · ${t('removeArg')}` })))), h('div', null, button(t('addArg'), () => update(old => ({ ...old, stdio: { ...old.stdio, args: [...old.stdio.args, valueField()] } }))))),
                fieldControl('stdio.cwd', t('cwd'), draft.stdio.cwd, cwd => update(old => ({ ...old, stdio: { ...old.stdio, cwd } })), t('cwdPlaceholder'), ''), pairFields('env')),
              h('div', { className: 'lmcp-section' }, h('label', { className: 'lmcp-check' }, h('input', { type: 'checkbox', checked: draft.enabled, disabled: busy, onChange: e => update(old => ({ ...old, enabled: e.target.checked })) }), t('enabled')), h('p', { className: 'lmcp-muted' }, t('enabledHint'))),
              h('details', { open: advancedOpen, onToggle: e => setAdvancedOpen(e.currentTarget.open) }, h('summary', null, t('advanced'), ' · ', t('optional')), h('div', { className: 'lmcp-detail-body' }, h('p', { className: 'lmcp-muted', style: { marginBottom: 0 } }, t('advancedHint')),
                draft.toolLoading !== undefined && h('label', { className: 'lmcp-check' },
                  h('input', { type: 'checkbox', checked: draft.toolLoading === 'on-demand', disabled: busy,
                    onChange: e => update(old => ({ ...old, toolLoading: e.target.checked ? 'on-demand' : 'eager' })) }), t('onDemand')),
                h('div', { className: 'lmcp-grid' }, numericField('startupTimeout', 'seconds30'), numericField('toolCallTimeout', 'seconds60'), numericField('closeTimeout', 'seconds5')),
                h('label', { className: 'lmcp-check' }, h('input', { ref: bindRef('advanced.reconnectEnabled'), type: 'checkbox', role: 'switch', 'aria-checked': draft.advanced.reconnectEnabled, checked: draft.advanced.reconnectEnabled, disabled: busy, onChange: e => update(old => ({ ...old, advanced: { ...old.advanced, reconnectEnabled: e.target.checked } })) }), t('reconnectEnabled')), h('p', { className: 'lmcp-muted', style: { marginBottom: 0 } }, t('reconnectHint')),
                h('div', { className: 'lmcp-grid', 'aria-disabled': !draft.advanced.reconnectEnabled }, numericField('initialDelay', 'secondsHalf', !draft.advanced.reconnectEnabled), numericField('maxDelay', 'seconds30', !draft.advanced.reconnectEnabled), numericField('maxAttempts', 'attempts10', !draft.advanced.reconnectEnabled, true)))),
              collision && h('div', { className: 'lmcp-notice', 'data-warning': true }, h('label', { className: 'lmcp-check' }, h('input', { type: 'checkbox', checked: overwrite, disabled: busy, onChange: e => { setOverwrite(e.target.checked); setPreview(null); } }), t('overwrite')), h('span', { className: 'lmcp-muted' }, t('overwriteHint'))),
              h('p', { className: 'lmcp-muted', style: { marginBottom: 0 } }, t('secret')),
              preview && h('details', null, h('summary', null, t('previewTitle')), h('p', { className: 'lmcp-muted' }, t('previewHint')), preview.containsLiteralSecrets && h('p', { className: 'lmcp-error' }, t('literal')), h('pre', { tabIndex: 0, 'aria-label': t('previewTitle') }, preview.yaml)),
              h('div', { className: 'lmcp-actions lmcp-form-actions' }, h('button', { type: 'submit', disabled: busy, className: 'lmcp-primary' }, busy ? t('busy') : t('save')), button(t('preview'), showPreview), button(t('cancel'), cancelEditor))),
            result && h('div', { className: 'lmcp-notice', role: 'status' }, h('strong', null, result.name + ' · ' + t('result')), h('p', null, t(result.value.ok ? 'testGood' : 'testBad')), !result.value.closeConfirmed && h('p', { className: 'lmcp-error' }, t('cleanup')), result.value.message && h('p', null, result.value.message), result.value.ok && h('pre', null, result.value.toolNames.length ? result.value.toolNames.join('\n') : t('noTools'))),
            !data ? h('p', { className: 'lmcp-muted', role: 'status' }, notice?.error ? t('retry') : t('loading')) : data.rows.length === 0 ? h('div', { className: 'lmcp-empty' }, h(ServerIcon, { size: 32 }), h('h2', null, t('empty')), h('p', { className: 'lmcp-muted' }, t('emptyHelp')), button(t('add'), () => start(), { className: 'lmcp-primary' })) :
              h('div', { className: 'lmcp-list' }, data.rows.map(row => h('article', { className: 'lmcp-card', key: row.name },
                h('div', { className: 'lmcp-row-head' }, h('div', { className: 'lmcp-actions' }, h(ServerIcon, { size: 19 }), h('strong', { className: 'lmcp-name' }, row.name), h('span', { className: 'lmcp-muted' }, row.config?.transport)), h('span', { className: 'lmcp-badge' }, h('span', { className: 'lmcp-dot', 'data-state': row.status.state }), t(row.status.state), row.status.state === 'connected' && ` · ${row.status.toolCount} ${t('tools')}`)),
                row.nativeOAuth && h('p', { className: 'lmcp-muted' }, t('nativeOAuth')),
                row.note && h('p', { className: 'lmcp-note' }, row.note),
                h('p', { className: 'lmcp-muted lmcp-endpoint' }, row.retained ? t('retained') : row.managedByPlugin ? t('plugin') : `${t('source')} · ${t(row.inherited ? 'inherited' : 'user')}`),
                row.config && h('p', { className: 'lmcp-muted lmcp-endpoint' }, (row.config.transport === 'stdio' ? row.config.command : row.config.url) === '[redacted]' ? t('keep') : row.config.transport === 'stdio' ? row.config.command : row.config.url),
                row.status.lastError && h('div', { className: 'lmcp-error', role: 'status' }, row.status.lastError),
                (row.status.result?.closeConfirmed === false || row.retained) && h('div', { className: 'lmcp-error', role: 'status' }, t('cleanup')),
                row.status.result?.cleanupError && h('div', { className: 'lmcp-error', role: 'status' }, row.status.result.cleanupError),
                h('div', { className: 'lmcp-actions' }, !row.managedByPlugin && !row.nativeOAuth && button(t('edit'), () => start(row)), !row.managedByPlugin && mutationButton(t(row.config.enabled === false ? 'enable' : 'disable'), () => mutate('toggle', row, { enabled: row.config.enabled === false }), { role: 'switch', 'aria-checked': row.config.enabled !== false, 'aria-label': `${row.name} · ${t(row.config.enabled === false ? 'enable' : 'disable')}` }),
                  button(t('probe'), () => run({ action: 'probe', name: row.name }, value => setResult({ name: row.name, value }))), mutationButton(t('restart'), () => run({ action: 'restart', name: row.name }, acceptSnapshot)),
                  !row.managedByPlugin && (!row.inherited || row.user) && mutationButton(t(row.inherited ? 'reset' : 'remove'), () => setConfirm({ name: row.name, action: row.inherited ? 'reset' : 'remove' }), { className: row.inherited ? '' : 'lmcp-danger' })),
                confirm?.name === row.name && h('div', { className: 'lmcp-confirm' }, h('span', null, t(confirm.action === 'reset' ? 'resetConfirm' : 'deleteConfirm')), mutationButton(t('yes'), () => mutate(confirm.action, row), { className: 'lmcp-danger' }), button(t('no'), () => setConfirm(null)))))),
            h('p', { className: 'lmcp-muted lmcp-footnote' }, t('statusHint'))));
        }
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 20, label: () => t('title') }, ServerIcon));
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, Page));
      },
    };
  },
});
