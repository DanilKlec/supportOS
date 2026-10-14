import { supabaseService } from "./supabase.service";
import { supabase } from "./supabase-client";

function client() {
	if (!supabase) throw new Error("Вход ещё не настроен");
	return supabase;
}
export const mfaService = {
	async factors() {
		const { data, error } = await client().auth.mfa.listFactors();
		if (error) throw error;
		return data.totp;
	},
	async enroll() {
		const { data, error } = await client().auth.mfa.enroll({
			factorType: "totp",
			issuer: "SupportOS",
		});
		if (error) throw error;
		return data;
	},
	async verify(factorId: string, code: string) {
		if (!/^\d{6}$/.test(code)) throw new Error("Введите шестизначный код");
		const { error } = await client().auth.mfa.challengeAndVerify({
			factorId,
			code,
		});
		if (error)
			throw new Error(
				"Не удалось подтвердить код. Проверьте код и время на телефоне.",
			);
		await supabaseService.refreshSessionIdentity();
	},
	async remove(factorId: string) {
		const factors = await this.factors();
		if (factors.length < 2)
			throw new Error("Сначала подключите новое устройство");
		const { error } = await client().auth.mfa.unenroll({ factorId });
		if (error) throw error;
	},
};
