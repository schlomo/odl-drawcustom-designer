import type { AssetKind, AssetUploadResult } from '../../core'
import { validateAssetUpload } from '../../core'

function loadImageBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(blob)
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve()
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Unreadable image'))
    }
    image.src = objectUrl
  })
}

async function loadFontBlob(blob: Blob): Promise<void> {
  const face = new FontFace('oepl-upload-verify', blob)
  await face.load()
}

/** Sync type check plus decode verification before storing in the content map. */
export async function verifyAndValidateAssetUpload(
  kind: AssetKind,
  file: File,
  key: string,
): Promise<AssetUploadResult> {
  const validated = validateAssetUpload(kind, file, key)
  if (!validated.ok) {
    return validated
  }

  try {
    if (kind === 'image') {
      await loadImageBlob(file)
    } else {
      await loadFontBlob(file)
    }
  } catch {
    return {
      ok: false,
      message:
        kind === 'image'
          ? `"${file.name || key}" could not be decoded as an image.`
          : `"${file.name || key}" could not be decoded as a font.`,
    }
  }

  return validated
}
