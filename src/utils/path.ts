/** Small Bun-only POSIX path utility for supported macOS/Linux hosts. */

function normalize(input: string): string {
	const absolute = input.startsWith("/");
	const parts: string[] = [];
	for (const part of input.replace(/\\/g, "/").split("/")) {
		if (!part || part === ".") continue;
		if (part === ".." && parts.length && parts[parts.length - 1] !== "..")
			parts.pop();
		else if (part !== ".." || !absolute) parts.push(part);
	}
	const result = parts.join("/");
	return absolute ? `/${result}` : result || ".";
}

function join(...parts: string[]): string {
	return normalize(parts.filter(Boolean).join("/"));
}

function resolve(...parts: string[]): string {
	let result = "";
	for (let index = parts.length - 1; index >= -1; index--) {
		const part = index < 0 ? (Bun.env.PWD ?? ".") : parts[index];
		result = `${part}/${result}`;
		if (part.startsWith("/")) break;
	}
	return normalize(result);
}

function dirname(input: string): string {
	const value = normalize(input);
	const index = value.lastIndexOf("/");
	return index <= 0
		? value.startsWith("/")
			? "/"
			: "."
		: value.slice(0, index);
}

function basename(input: string): string {
	const value = normalize(input);
	return value.slice(value.lastIndexOf("/") + 1);
}

function relative(from: string, to: string): string {
	const a = normalize(resolve(from)).split("/").filter(Boolean);
	const b = normalize(resolve(to)).split("/").filter(Boolean);
	let common = 0;
	while (common < a.length && common < b.length && a[common] === b[common])
		common++;
	return [...a.slice(common).map(() => ".."), ...b.slice(common)].join("/");
}

function isAbsolute(input: string): boolean {
	return input.startsWith("/");
}

export default {
	join,
	resolve,
	dirname,
	basename,
	relative,
	isAbsolute,
	sep: "/",
	posix: { join, normalize, relative, basename, isAbsolute, sep: "/" },
};
