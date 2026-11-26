// Bestandsopslag (spec bestandsopslag, ADR 0060). testing.ts (fileStorageContract) staat hier bewust niet in: alleen tests.
export {
  defineFileStorage,
  isFileKey,
  isFileStorage,
  type DownloadUrlRequest,
  type FileStorage,
  type SignedUpload,
  type StoredFile,
  type UploadUrlRequest,
} from './port.ts';
export { createFileService, type FileService, type FileServiceOptions } from './service.ts';
export { createLocalFileStorage, type LocalFileStorage, type LocalFileStorageOptions } from './local.ts';
