import { readFile } from 'node:fs/promises';

export async function configureProfile(call) {
  const name = 'SupportOS · Доступ';
  const short_description = 'Подтверждение регистрации SupportOS. Доступ и роли выдаёт администратор.';
  const description = 'Добро пожаловать в SupportOS 👋\n\nЗдесь вы подтверждаете заявку на доступ к рабочему пространству.\n\n1. Создайте заявку на сайте SupportOS.\n2. Перейдите сюда по кнопке и подтвердите её.\n3. Вернитесь на сайт и завершите регистрацию.\n\nПосле этого администратор рассмотрит заявку и назначит роли.\n\n🔒 Пароль вводится только на сайте — боту его отправлять не нужно.';
  const commands = [
    { command: 'start', description: 'Начать подтверждение заявки' },
    { command: 'help', description: 'Как получить доступ к SupportOS' },
  ];
  for (const language_code of ['', 'ru']) {
    await call('setMyName', { name, language_code });
    await call('setMyShortDescription', { short_description, language_code });
    await call('setMyDescription', { description, language_code });
    await call('setMyCommands', { commands, language_code });
  }
  await call('setChatMenuButton', { menu_button: { type: 'commands' } });
  const photo = new FormData();
  photo.set('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
  photo.set('avatar', new Blob([await readFile(new URL('../public/telegram-avatar.jpg', import.meta.url))], { type: 'image/jpeg' }), 'supportos.jpg');
  await call('setMyProfilePhoto', photo);
  const actual = await call('getMyDescription', { language_code: 'ru' });
  if (actual.description !== description) throw new Error('Profile description was not saved.');
}
