'use strict'

const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')
const { spawn } = require('node:child_process')

const PORT = Number(process.env.PORT || 47000)
const ARIA2_PORT = Number(process.env.ARIA2_PORT || 29100)
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || '/downloads'
const ROOT = process.env.WEB_ROOT || path.join(__dirname, '../dist')
const SESSION_FILE = '/tmp/aria2.session'

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })
fs.closeSync(fs.openSync(SESSION_FILE, 'a'))

const aria2 = spawn('aria2c', [
  '--enable-rpc=true',
  '--rpc-listen-all=false',
  `--rpc-listen-port=${ARIA2_PORT}`,
  '--rpc-allow-origin-all=true',
  '--continue=true',
  '--follow-torrent=true',
  '--enable-dht=true',
  '--enable-peer-exchange=true',
  '--bt-enable-lpd=false',
  '--check-certificate=false',
  '--disable-ipv6=true',
  `--save-session=${SESSION_FILE}`,
  `--input-file=${SESSION_FILE}`,
  `--dir=${DOWNLOAD_DIR}`,
], { stdio: 'inherit' })

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function sendFile(res, filePath) {
  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    res.writeHead(200, {
      'content-length': stat.size,
      'content-type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
    })
    fs.createReadStream(filePath).pipe(res)
  })
}

function proxyJsonRpc(req, res) {
  const upstream = http.request({
    hostname: '127.0.0.1',
    port: ARIA2_PORT,
    path: '/jsonrpc',
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${ARIA2_PORT}`,
    },
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers)
    upstreamRes.pipe(res)
  })

  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: `aria2 rpc unavailable: ${err.message}` }))
  })

  req.pipe(upstream)
}

function handlePathExists(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const rawPath = url.searchParams.get('path') || ''
  const resolvedDownloadDir = path.resolve(DOWNLOAD_DIR)
  const resolvedPath = path.resolve(rawPath)
  const insideDownloads = resolvedPath === resolvedDownloadDir || resolvedPath.startsWith(`${resolvedDownloadDir}${path.sep}`)
  const exists = insideDownloads && fs.existsSync(resolvedPath)

  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ exists }))
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('ok')
    return
  }

  if (req.url && req.url.startsWith('/jsonrpc')) {
    proxyJsonRpc(req, res)
    return
  }

  if (req.url && req.url.startsWith('/api/path-exists')) {
    handlePathExists(req, res)
    return
  }

  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  const normalized = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '')
  const requested = path.join(ROOT, normalized)
  const fallback = path.join(ROOT, 'index.html')

  fs.stat(requested, (err, stat) => {
    sendFile(res, !err && stat.isFile() ? requested : fallback)
  })
})

server.on('upgrade', (req, socket, head) => {
  if (!req.url || !req.url.startsWith('/jsonrpc')) {
    socket.destroy()
    return
  }

  const upstream = net.connect(ARIA2_PORT, '127.0.0.1', () => {
    const headers = Object.entries({
      ...req.headers,
      host: `127.0.0.1:${ARIA2_PORT}`,
    }).map(([key, value]) => `${key}: ${value}`).join('\r\n')

    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers}\r\n\r\n`)
    if (head.length > 0) upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  })

  upstream.on('error', () => socket.destroy())
})

function shutdown() {
  server.close()
  aria2.kill('SIGTERM')
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

aria2.on('exit', (code) => {
  if (code !== 0 && code !== null) process.exit(code)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Motrix Next web listening on 0.0.0.0:${PORT}`)
  console.log(`Download directory: ${DOWNLOAD_DIR}`)
})
