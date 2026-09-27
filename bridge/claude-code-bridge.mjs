#!/usr/bin/env node
// Local bridge between the Sites Code window and a CLI agent (Claude Code by default).
// Zero dependencies. Listens on 127.0.0.1 only, checks Origin and a per-run token,
// runs the CLI with the prompt on stdin and streams its output back as Server-Sent Events.
//
//   node bridge/claude-code-bridge.mjs
//
// Env:
//   SITES_AI_PORT     port (default 4317)
//   SITES_AI_CMD      command line to run (default: claude -p --output-format stream-json --verbose --include-partial-messages --tools "")
//   SITES_AI_ORIGINS  extra allowed origins, comma separated (localhost and 127.0.0.1 on any port are allowed)
//   SITES_AI_TOKEN    fixed token instead of a random one
//   SITES_AI_CWD      working directory for the CLI (default: a fresh temp dir)
//   SITES_AI_TIMEOUT  seconds before a run is stopped (default 600)

import http from 'node:http'
import { spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.env.SITES_AI_PORT || 4317)
const HOST = '127.0.0.1'
const TOKEN = process.env.SITES_AI_TOKEN || randomBytes(24).toString('base64url')
const TIMEOUT = Number(process.env.SITES_AI_TIMEOUT || 600) * 1000
const MAX_BODY = 4 * 1024 * 1024
const CMD = splitArgs(process.env.SITES_AI_CMD || 'claude -p --output-format stream-json --verbose --include-partial-messages --tools ""')
const CWD = process.env.SITES_AI_CWD || mkdtempSync(join(tmpdir(), 'sites-ai-'))
const EXTRA_ORIGINS = (process.env.SITES_AI_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)

// Shell-like splitting with single and double quotes; no shell is involved when running it.
function splitArgs(s) {
  const out = []
  let cur = ''
  let q = null
  let has = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === q) q = null
      else if (c === '\\' && q === '"' && i + 1 < s.length) cur += s[++i]
      else cur += c
    } else if (c === '"' || c === "'") { q = c; has = true }
    else if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ''; has = false }
    else if (c === '\\' && i + 1 < s.length) { cur += s[++i]; has = true }
    else { cur += c; has = true }
  }
  if (cur || has) out.push(cur)
  return out
}

function originAllowed(origin) {
  if (!origin) return true // not a browser request; the token still applies
  if (EXTRA_ORIGINS.includes(origin)) return true
  try {
    const u = new URL(origin)
    return (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')
  } catch { return false }
}

// Blocks DNS rebinding: the Host header must name this machine.
function hostAllowed(host) {
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host || '')
}

function tokenOk(req) {
  const m = /^Bearer\s+(.+)$/.exec(req.headers.authorization || '')
  const got = Buffer.from(m ? m[1].trim() : '')
  const want = Buffer.from(TOKEN)
  return got.length === want.length && timingSafeEqual(got, want)
}

function cors(req, res) {
  const origin = req.headers.origin
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
    res.setHeader('Access-Control-Max-Age', '600')
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) { reject(new Error('request too large')); req.destroy() } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// Pulls text out of Claude Code's stream-json lines; other CLIs' plain output passes through.
function makeParser(emit) {
  let partials = false
  let emitted = false
  return (line) => {
    if (!line.trim()) return
    let j
    try { j = JSON.parse(line) } catch { emit(line + '\n'); emitted = true; return }
    if (j.type === 'stream_event') {
      const ev = j.event
      if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) { partials = true; emitted = true; emit(ev.delta.text) }
    } else if (j.type === 'assistant' && !partials) {
      for (const b of j.message?.content || []) if (b.type === 'text' && b.text) { emitted = true; emit(b.text) }
    } else if (j.type === 'result') {
      if (j.is_error) throw new Error(typeof j.result === 'string' ? j.result : 'the CLI reported an error')
      if (!emitted && typeof j.result === 'string') { emitted = true; emit(j.result) }
    } else if (typeof j.text === 'string' && !j.type) {
      emitted = true; emit(j.text)
    }
  }
}

function run(req, res, body) {
  let input
  try { input = JSON.parse(body) } catch { return json(res, 400, { error: 'body must be JSON' }) }
  if (typeof input.prompt !== 'string' || !input.prompt.trim()) return json(res, 400, { error: 'prompt is required' })
  let prompt = input.prompt
  if (typeof input.content === 'string' && input.content && !prompt.includes(input.content)) {
    prompt += `\n\nFile ${input.file || ''}:\n\`\`\`tsx\n${input.content}\n\`\`\`\n`
  }

  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  const send = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
  let finished = false
  let timer
  const finish = (err) => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    if (err) send('error', { error: err })
    send('done', {})
    res.end()
  }

  const [bin, ...args] = CMD
  const started = Date.now()
  console.log(`[run] ${input.file || '(no file)'} · ${prompt.length} chars`)
  let child
  try {
    child = spawn(bin, args, { cwd: CWD, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (e) { return finish(`could not start ${bin}: ${e.message}`) }

  timer = setTimeout(() => { child.kill('SIGTERM'); finish(`stopped after ${TIMEOUT / 1000}s`) }, TIMEOUT)
  const parse = makeParser((text) => send('message', { text }))
  let buf = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      try { parse(line) } catch (e) { finish(e.message); child.kill('SIGTERM'); return }
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000) })
  child.on('error', (e) => finish(e.code === 'ENOENT' ? `${bin} was not found. Install it or set SITES_AI_CMD.` : e.message))
  child.on('close', (code) => {
    try { if (buf) parse(buf) } catch (e) { return finish(e.message) }
    console.log(`[done] exit ${code} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
    finish(code === 0 ? undefined : `${bin} exited with code ${code}${stderr.trim() ? `: ${stderr.trim().split('\n').slice(-3).join(' ')}` : ''}`)
  })
  // Stop the CLI if the browser goes away.
  res.on('close', () => { if (!finished) { finished = true; clearTimeout(timer); child.kill('SIGTERM') } })
  child.stdin.on('error', () => {})
  child.stdin.end(prompt)
}

const server = http.createServer(async (req, res) => {
  if (!hostAllowed(req.headers.host)) return json(res, 403, { error: 'bad host' })
  if (!originAllowed(req.headers.origin)) return json(res, 403, { error: 'origin not allowed; add it to SITES_AI_ORIGINS' })
  cors(req, res)
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const path = new URL(req.url || '/', 'http://x').pathname
  if (!tokenOk(req)) return json(res, 401, { error: 'wrong or missing token' })
  if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true, cmd: CMD[0] })
  if (req.method === 'POST' && path === '/run') {
    let body
    try { body = await readBody(req) } catch (e) { return json(res, 413, { error: e.message }) }
    return run(req, res, body)
  }
  json(res, 404, { error: 'not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`sites ai bridge on http://${HOST}:${PORT}`)
  console.log(`command: ${CMD.map((a) => (a === '' || /\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`)
  console.log(`working dir: ${CWD}`)
  console.log(`\ntoken (paste into Project settings > AI):\n\n  ${TOKEN}\n`)
})
server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `port ${PORT} is in use; set SITES_AI_PORT` : e.message); process.exit(1) })
