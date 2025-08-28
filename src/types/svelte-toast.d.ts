declare module 'svelte-toast' {
	import type { SvelteComponent } from 'svelte';

	export interface SvelteToastOptions {
		id?: number;
		target?: string;
		msg?: string;
		theme?: Record<string, string>;
		pausable?: boolean;
		progress?: number;
		[key: string]: any;
	}

	interface ToastFunction {
		(msg: string, options?: SvelteToastOptions): void;
		push(msg: string, options?: SvelteToastOptions): number;
		pop(id?: number): void;
		set(options: SvelteToastOptions): void;
		success(msg: string, options?: SvelteToastOptions): number;
		error(msg: string, options?: SvelteToastOptions): number;
		warning(msg: string, options?: SvelteToastOptions): number;
		info(msg: string, options?: SvelteToastOptions): number;
		loading(msg: string, options?: SvelteToastOptions): number;
	}

	export const toast: ToastFunction;
	export class SvelteToast extends SvelteComponent {}
}