import { useEffect, useMemo, useState } from 'react';
import pb from '@/lib/pocketbase-client';

/**
 * Session state for the signed-in PocketBase user: user, isAuthed, isLoading,
 * login, signup, logout. No provider to mount — every caller reads the same
 * `pb.authStore`.
 *
 * The JWT is persisted in localStorage, which the server cannot read, so the
 * session is filled in after hydration. Render on `isLoading` (a spinner, a
 * skeleton) instead of the signed-out state, or a signed-in visitor sees a
 * "Sign in" button flash on every page load.
 */
let sessionRefresh: Promise<unknown> | null = null;

export function useAuth() {
	const [user, setUser] = useState<typeof pb.authStore.record>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
        let cancelled = false;
        const unsubscribe = pb.authStore.onChange((_token, record) => { if (!cancelled) setUser(record); });
        const validate = async () => {
            try {
                if (pb.authStore.isValid) {
                    if (!sessionRefresh) sessionRefresh = pb.collection('users').authRefresh({ requestKey: null }).finally(() => { sessionRefresh = null; });
                    await sessionRefresh;
                } else { pb.authStore.clear(); }
            } catch {
                // A cached token is not proof that the account still exists.
                pb.authStore.clear();
            } finally {
                if (!cancelled) { setUser(pb.authStore.isValid ? pb.authStore.record : null); setIsLoading(false); }
            }
        };
        void validate();
        return () => { cancelled = true; unsubscribe(); };
    }, []);

	return useMemo(
		() => ({
			user,
			isAuthed: !isLoading && Boolean(user) && pb.authStore.isValid,
			isLoading,
			login: (email: string, password: string) =>
				pb.collection('users').authWithPassword(email, password),
			signup: async (
				email: string,
				password: string,
				extraFields: Record<string, unknown> = {},
			) => {
				pb.authStore.clear();
				try {
				return await pb.collection('users').create({
					email,
					password,
					passwordConfirm: password,
                    name: String(extraFields.name || '').slice(0,120),
                    role: 'klant',
				});
				} finally {
					pb.authStore.clear();
				}
			},
			logout: () => pb.authStore.clear(),
		}),
		[user, isLoading],
	);
}

export default useAuth;
