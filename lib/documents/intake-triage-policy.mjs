const SAFE_EXTENSIONS = new Set([
  'xlsx','xls','xlsm','pdf','doc','docx','ppt','pptx','txt','xml','html','htm',
  'jpg','jpeg','png','tif','tiff','bmp','gif','wmf','msg'
]);
const ACTIVE_EXTENSIONS = new Set(['exe','dll','bat','jar','swf','lnk']);
const MEDIA_EXTENSIONS = new Set(['wmv','avi','mpg','mpeg','mp4']);
const ARCHIVE_EXTENSIONS = new Set(['zip','rar']);

function extensionOf(name = '') {
  const cleaned = String(name).trim().toLowerCase();
  const index = cleaned.lastIndexOf('.');
  return index >= 0 ? cleaned.slice(index + 1) : '';
}

export function classifyDocumentIntakeFile(originalName, mimeType = '') {
  const name = String(originalName || '').trim();
  const lower = name.toLowerCase();
  const ext = extensionOf(name);
  const mime = String(mimeType || '').toLowerCase();

  if (!name) return { policy: 'unsupported_review', state: 'review_required', reason: 'missing_name' };
  if (name.startsWith('~$') || lower === 'thumbs.db' || lower === 'desktop.ini') {
    return { policy: 'non_source_artifact', state: 'rejected_non_source', reason: 'temporary_or_system_artifact' };
  }
  if (ACTIVE_EXTENSIONS.has(ext) || mime === 'application/x-msdownload' || mime === 'application/x-shockwave-flash') {
    return { policy: 'quarantine_executable', state: 'quarantined', reason: 'active_or_executable_content' };
  }
  if (ARCHIVE_EXTENSIONS.has(ext) || mime.includes('zip') || mime.includes('compressed')) {
    return { policy: 'archive_review', state: 'review_required', reason: 'archive_requires_explicit_review' };
  }
  if (MEDIA_EXTENSIONS.has(ext) || mime.startsWith('video/')) {
    return { policy: 'media_metadata_only', state: 'metadata_only', reason: 'video_metadata_only' };
  }
  if (SAFE_EXTENSIONS.has(ext)) {
    return { policy: 'safe_classify', state: 'ready_for_extraction', reason: 'supported_passive_format' };
  }
  return { policy: 'unsupported_review', state: 'review_required', reason: 'unsupported_or_unknown_format' };
}
