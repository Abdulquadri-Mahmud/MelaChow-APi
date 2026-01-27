import cloudinary from "../config/cloudinary.js";

// Upload file to Cloudinary
export const uploadToCloudinary = async (filePath, folder) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder, // Folder in Cloudinary
      resource_type: "image", // Ensure image type
    });
    return result.secure_url; // Return public URL
  } catch (err) {
    console.error("Cloudinary Upload Error:", err);
    throw new Error("Failed to upload image");
  }
};
