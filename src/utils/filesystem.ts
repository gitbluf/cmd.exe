/**
 * Filesystem utility functions
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDirectory(dir: string): void {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

/**
 * Read a file safely, returning undefined if it doesn't exist
 */
export function readFileSafe(
	filePath: string,
	encoding: BufferEncoding = "utf-8",
): string | undefined {
	try {
		if (fs.existsSync(filePath)) {
			return fs.readFileSync(filePath, encoding);
		}
	} catch (error) {
		// Silently ignore errors when reading
	}
	return undefined;
}

/**
 * Write a file safely, creating parent directories if needed
 */
export function writeFileSafe(
	filePath: string,
	content: string,
	encoding: BufferEncoding = "utf-8",
): boolean {
	try {
		const dir = path.dirname(filePath);
		ensureDirectory(dir);
		fs.writeFileSync(filePath, content, encoding);
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * List files in a directory
 */
export function listFiles(dir: string, pattern?: RegExp): string[] {
	try {
		if (!fs.existsSync(dir)) {
			return [];
		}

		let files = fs.readdirSync(dir);

		if (pattern) {
			files = files.filter((f) => pattern.test(f));
		}

		return files;
	} catch (error) {
		return [];
	}
}

/**
 * Delete a file or directory
 */
export function deleteFileOrDir(filePath: string): boolean {
	try {
		if (fs.existsSync(filePath)) {
			const stat = fs.statSync(filePath);
			if (stat.isDirectory()) {
				fs.rmSync(filePath, { recursive: true, force: true });
			} else {
				fs.unlinkSync(filePath);
			}
			return true;
		}
	} catch (error) {
		// Silently ignore errors
	}
	return false;
}

/**
 * Check if a file exists
 */
export function fileExists(filePath: string): boolean {
	try {
		return fs.existsSync(filePath);
	} catch (error) {
		return false;
	}
}

/**
 * Get file size in bytes
 */
export function getFileSize(filePath: string): number | undefined {
	try {
		const stat = fs.statSync(filePath);
		return stat.size;
	} catch (error) {
		return undefined;
	}
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / k ** i).toFixed(2)) + " " + sizes[i];
}

/**
 * Get relative path from one directory to another
 */
export function getRelativePath(from: string, to: string): string {
	return path.relative(from, to);
}

/**
 * Resolve a path relative to a base directory
 */
export function resolvePath(basePath: string, relativePath: string): string {
	return path.resolve(basePath, relativePath);
}

/**
 * Normalize a path (remove ../ and ./)
 */
export function normalizePath(filePath: string): string {
	return path.normalize(filePath);
}

/**
 * Get the extension of a file
 */
export function getExtension(filePath: string): string {
	return path.extname(filePath);
}

/**
 * Get the base name of a file (without directory)
 */
export function getBaseName(filePath: string): string {
	return path.basename(filePath);
}

/**
 * Get the directory of a file
 */
export function getDirName(filePath: string): string {
	return path.dirname(filePath);
}
