export { DEFAULT_IMAGE_CONFIG, isImageExtension, isImageMimeType } from "./config";
export type { ImageConfig } from "./config";

export { compressImage, compressImages, blobToFile } from "./compress";
export type { CompressOptions, CompressResult } from "./compress";

export { extractImages, filterValidImages } from "./extract";
export type { ExtractedFile } from "./extract";

export { uploadImage, uploadImages } from "./upload";
export type { UploadResult, UploadProgress, ProgressCallback } from "./upload";
