import { describe, expect, it } from 'vitest'
import {
  buildFileList,
  filterAudioFiles,
  filterDocumentFiles,
  filterImageFiles,
  filterVideoFiles,
  getFileExtension,
  getFileName,
  getFileSelection,
  isAudioOrVideo,
  isTorrent,
  listTorrentFiles,
  removeExtensionDot,
} from '../file'
import type { Aria2File, EnrichedFile } from '@shared/types'

function file(index: string, selected: Aria2File['selected'], path = `/tmp/${index}.txt`): Aria2File {
  return { index, path, length: '1000', completedLength: '0', selected, uris: [] }
}

function enriched(extension: string): EnrichedFile {
  return { ...file('1', 'true', `/tmp/file${extension}`), extension }
}

describe('File utility contract', () => {
  it('parses Unix and Windows filenames and extensions', () => {
    expect(getFileName('/home/user/archive.tar.gz')).toBe('archive.tar.gz')
    expect(getFileName('C:\\Users\\file.txt')).toBe('file.txt')
    expect(getFileExtension('archive.tar.gz')).toBe('gz')
    expect(getFileExtension('.gitignore')).toBe('')
    expect(removeExtensionDot('.tar.gz')).toBe('tar.gz')
  })

  it('detects torrent uploads by extension or MIME type', () => {
    expect(isTorrent({ name: 'ubuntu.torrent', type: '' })).toBe(true)
    expect(isTorrent({ name: 'upload', type: 'application/x-bittorrent' })).toBe(true)
    expect(isTorrent({ name: 'archive.zip', type: 'application/zip' })).toBe(false)
  })

  it('serializes aria2 file selection states', () => {
    expect(getFileSelection([])).toBe('none')
    expect(getFileSelection([file('1', 'false'), file('2', 'false')])).toBe('none')
    expect(getFileSelection([file('1', 'true'), file('2', 'true')])).toBe('all')
    expect(getFileSelection([file('1', 'true'), file('2', 'false'), file('3', 'true')])).toBe('1,3')
  })

  it('enriches torrent files with display metadata', () => {
    const result = listTorrentFiles([file('1', 'true', '/tmp/video.mp4')])
    expect(result[0]).toMatchObject({ idx: 1, extension: '.mp4', path: '/tmp/video.mp4' })
  })

  it('builds the upload entry consumed by Naive UI', () => {
    const raw = new File(['hello'], 'test.txt', { type: 'text/plain' })
    expect(buildFileList(raw)[0]).toMatchObject({ name: 'test.txt', status: 'ready', percentage: 0, size: 5, raw })
  })

  it('classifies representative media and document files', () => {
    expect(filterVideoFiles([enriched('.mp4'), enriched('.srt'), enriched('.zip')])).toHaveLength(2)
    expect(filterAudioFiles([enriched('.flac'), enriched('.zip')])).toHaveLength(1)
    expect(filterImageFiles([enriched('.png'), enriched('.zip')])).toHaveLength(1)
    expect(filterDocumentFiles([enriched('.pdf'), enriched('.zip')])).toHaveLength(1)
  })

  it('recognizes media URLs', () => {
    expect(isAudioOrVideo('https://example.com/movie.mp4')).toBe(true)
    expect(isAudioOrVideo('https://example.com/song.mp3')).toBe(true)
    expect(isAudioOrVideo('https://example.com/archive.zip')).toBe(false)
  })
})
