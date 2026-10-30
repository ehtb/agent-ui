/** Content types by file extension (with the dot), for the files of a built site. */
export const MIME_TYPES: Readonly<Record<string, string>>;
/** Headers every answer carries: `x-content-type-options: nosniff`. */
export const SECURITY_HEADERS: Readonly<Record<string, string>>;
/** True when the last segment of a URL path ends in a known file extension: the path is a file, not a page. */
export function isFilePath(pathname: string): boolean;
