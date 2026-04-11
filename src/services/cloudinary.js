// Ffads - Cloudinary Upload Service
// Cloudinary REST API for uploading images without extra native SDKs.

export async function uploadToCloudinary(base64Image) {
  // We expect these in standard `.env`
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'demo';
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'unsigned_preset';

  if (cloudName === 'demo') {
    console.warn(`☁️ [Cloudinary] ⚠️ Using default 'demo' account — uploads will likely fail or be ephemeral`);
  }

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const data = {
    file: `data:image/jpeg;base64,${base64Image}`,
    upload_preset: uploadPreset,
  };

  try {
    console.log(`☁️ [Cloudinary] UPLOAD → Sending image to cloud="${cloudName}"...`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (response.ok) {
      console.log(`☁️ [Cloudinary] ✅ Upload successful: ${result.secure_url}`);
      return { success: true, url: result.secure_url };
    } else {
      console.error(`☁️ [Cloudinary] ❌ Upload failed: ${result.error?.message || 'Unknown error'}`);
      return { success: false, error: result.error?.message || 'Upload failed' };
    }
  } catch (error) {
    console.error(`☁️ [Cloudinary] ❌ Network error: ${error.message}`);
    return { success: false, error: error.message };
  }
}
