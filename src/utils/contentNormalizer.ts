/* eslint-disable @typescript-eslint/no-explicit-any */

// Function to detect image format from base64 data
function detectImageFormat(base64Data: string): string {
  // Remove data URL prefix if present
  const cleanData = base64Data.replace(/^data:image\/[^;]+;base64,/, '');

  try {
    // Decode first few bytes to check magic numbers
    const binaryString = atob(cleanData.substring(0, 32));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Check magic numbers for different image formats
    // PNG: 89 50 4E 47
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return 'image/png';
    }

    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }

    // GIF: 47 49 46 38
    if (
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38
    ) {
      return 'image/gif';
    }

    // WebP: 52 49 46 46 ... 57 45 42 50
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'image/webp';
    }

    // BMP: 42 4D
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
      return 'image/bmp';
    }

    // If we can't detect, assume JPEG as it's more common than PNG for screenshots
    return 'image/jpeg';
  } catch (error) {
    // If base64 decoding fails, default to JPEG
    return 'image/jpeg';
  }
}

// Function to normalize tool output content, especially for handling images
export function normalizeToolContent(content: any): any {
  // If content is string, return as is
  if (typeof content === 'string') {
    return content;
  }

  // If content is an array, process each item
  if (Array.isArray(content)) {
    return content.map(item => normalizeContentItem(item));
  }

  // If content is an object that might be an image, normalize it
  if (content && typeof content === 'object') {
    return normalizeContentItem(content);
  }

  return content;
}

// Helper function to normalize individual content items
export function normalizeContentItem(item: any): any {
  if (!item || typeof item !== 'object') {
    return item;
  }

  // Check if this looks like an image object with data but missing source
  if (item.type === 'image' && item.data && !item.source) {
    const detectedMediaType = item.media_type || detectImageFormat(item.data);
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: detectedMediaType,
        data: item.data,
      },
    };
  }

  // Check if this has image properties but is structured differently
  if (item.image && item.image.data && !item.image.source) {
    const detectedMediaType =
      item.image.media_type || detectImageFormat(item.image.data);
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: detectedMediaType,
        data: item.image.data,
      },
    };
  }

  return item;
}
