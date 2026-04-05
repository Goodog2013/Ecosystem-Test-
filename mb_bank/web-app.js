(function () {
  "use strict";

  const API = "/api/mb-bank";
  const TOKEN_KEY = "mb_bank_token_v1";
  const LANG_KEY = "mb_bank_lang_v1";
  const POLL_MS = 1000;
  const EASTER_MODE_MS = 12_000;
  const TITLE_TAP_TARGET = 5;
  const SECRET_CODE = [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "KeyB",
    "KeyA",
  ];
  const ROLE_LABELS = {
    ru: { buyer: "покупатель", seller: "продавец", admin: "админ" },
    en: { buyer: "buyer", seller: "seller", admin: "admin" },
  };
  const I18N = {
    ru: {
      authTitle: "Вход / Регистрация",
      tabLogin: "Вход",
      tabRegister: "Регистрация",
      loginUsernameLabel: "Имя пользователя",
      loginPasswordLabel: "Пароль",
      loginBtn: "Войти",
      registerUsernameLabel: "Имя пользователя (A-Z, a-z, 0-9, _)",
      registerPasswordLabel: "Пароль (мин. 6)",
      registerBtn: "Создать аккаунт",
      profileTitleText: "Профиль",
      balanceLabel: "Баланс",
      openProfileModalBtn: "Профиль",
      openSettingsModalBtn: "Настройки",
      logoutBtn: "Выйти",
      transferTitle: "Перевод",
      toUserLabel: "Кому",
      transferAmountLabel: "Сумма (RUB)",
      transferDescriptionLabel: "Описание",
      transferBtn: "Сделать перевод",
      adminPanelTitle: "Админ-панель",
      adminUserLabel: "Пользователь",
      adminAmountLabel: "Сумма (RUB)",
      adminRoleLabel: "Роль",
      adminDescriptionLabel: "Описание",
      adminAddMoneyBtn: "Начислить деньги",
      adminSubtractMoneyBtn: "Отчислить деньги",
      openBankReserveModalBtn: "Резерв банка",
      adminSetRoleBtn: "Применить роль",
      adminClearTransfersBtn: "Очистить переводы",
      usersTitle: "Пользователи",
      usersHeadUser: "Пользователь",
      usersHeadBalance: "Баланс",
      usersHeadRole: "Роль",
      transfersTitle: "Последние переводы",
      txHeadTime: "Время",
      txHeadFrom: "От",
      txHeadTo: "Кому",
      txHeadAmount: "Сумма",
      txHeadStatus: "Статус",
      txHeadDescription: "Описание",
      reserveModalTitle: "Резерв банка (скрытый счет)",
      reserveCurrentLabel: "Текущая сумма",
      reserveNewLabel: "Новая сумма (RUB)",
      saveBankReserveBtn: "Сохранить",
      closeBankReserveModalBtn: "Закрыть",
      profileModalTitle: "Мой профиль",
      profileUploadAvatarLabel: "Загрузить аватар",
      profileAvatarHint: "Изображение до 1.5 МБ.",
      profileRemoveAvatarBtn: "Удалить аватар",
      saveProfileBtn: "Сохранить профиль",
      closeProfileModalBtn: "Закрыть",
      settingsModalTitle: "Настройки",
      settingsThemeLabel: "Тема",
      settingsLanguageLabel: "Язык",
      saveSettingsBtn: "Сохранить настройки",
      closeSettingsModalBtn: "Закрыть",
      placeholderOptionalNote: "Необязательная заметка",
      placeholderOptionalAdminNote: "Необязательная заметка админа",
      empty: "Пусто",
      incoming: "Входящий",
      outgoing: "Исходящий",
      from: "от",
      to: "к",
      signedIn: "Вход выполнен: {username}",
      welcomeBack: "С возвращением, {username}",
      signInFailed: "Ошибка входа: {error}",
      profileCreated: "Профиль создан: {username}",
      registrationFailed: "Ошибка регистрации: {error}",
      loggedOut: "Выход выполнен.",
      signInFirst: "Сначала войдите в аккаунт.",
      selectRecipient: "Выберите получателя.",
      enterAmount: "Введите сумму.",
      transferDone: "Перевод {amount} RUB -> {to} выполнен.",
      transferSent: "Перевод отправлен: {amount} RUB",
      transferFailed: "Ошибка перевода: {error}",
      adminOnly: "Доступно только администратору.",
      selectUserAndAmount: "Выберите пользователя и сумму.",
      addDone: "Начислено {amount} RUB пользователю {to}.",
      addFailed: "Ошибка начисления: {error}",
      subtractDone: "Отчислено {amount} RUB у пользователя {to}.",
      subtractFailed: "Ошибка отчисления: {error}",
      selectUserAndRole: "Выберите пользователя и роль.",
      roleUpdated: "Роль обновлена: {to} -> {role}",
      roleUpdateFailed: "Ошибка смены роли: {error}",
      transfersCleared: "Переводы очищены.",
      clearFailed: "Ошибка очистки: {error}",
      enterReserveAmount: "Введите сумму резерва.",
      reserveSet: "Резерв банка установлен: {amount} RUB.",
      reserveUpdated: "Резерв банка обновлен.",
      reserveUpdateFailed: "Ошибка изменения резерва: {error}",
      profileSaved: "Профиль сохранен.",
      profileUpdated: "Профиль обновлен.",
      profileSaveFailed: "Ошибка сохранения профиля: {error}",
      settingsSaved: "Настройки сохранены.",
      settingsSaveFailed: "Ошибка сохранения настроек: {error}",
      stateSynced: "Состояние синхронизировано.",
      sessionExpired: "Сессия истекла. Войдите снова.",
      syncFailed: "Ошибка синхронизации: {error}",
      publicLoaded: "Публичное состояние загружено.",
      loadFailed: "Ошибка загрузки: {error}",
      onlyImage: "Выберите файл изображения.",
      imageTooLarge: "Изображение слишком большое (макс 1.5 МБ).",
      avatarSelected: "Аватар выбран. Сохраните профиль для применения.",
      avatarReadFailed: "Не удалось прочитать изображение.",
      avatarWillBeRemoved: "Аватар будет удален. Сохраните профиль для применения.",
      ready: "Готово.",
      enterUsernamePassword: "Введите имя пользователя и пароль.",
      roleBuyer: "покупатель",
      roleSeller: "продавец",
      roleAdmin: "админ",
      themeNight: "Ночная",
      themeLight: "Светлая",
      themeMint: "Мятная",
      myCardLabel: "ID карты",
      openTransferBtn: "Сделать перевод",
      transferModalTitle: "Сделать перевод",
      transferByUserTab: "По имени",
      transferByCardTab: "По ID карты",
      transferByQrTab: "QR из MDM",
      toCardIdLabel: "ID карты",
      qrPayloadLabel: "QR-код MDM",
      qrPayloadHint: "Вставьте код из сканера MB Bank (строка вида MDMQR:...).",
      requestCameraAccessBtn: "Запросить доступ к камере",
      openQrScannerBtn: "Сканировать камерой",
      qrScannerTitle: "Сканер MDM QR",
      qrScannerSubtitle: "Наведите камеру на QR-код и оплата пройдет автоматически.",
      qrScannerStatusStarting: "Запуск камеры...",
      qrScannerStatusReady: "Камера активна. Наведите QR в рамку.",
      qrScannerStatusScanned: "QR считан. Выполняем оплату...",
      qrScannerStatusNoSupport: "Сканер недоступен: браузер не поддерживает распознавание QR.",
      qrScannerStatusNoMedia: "Камера недоступна в этом браузере.",
      qrScannerStatusNoCodeInImage: "На выбранном фото QR-код не найден.",
      qrScannerStatusReadImageFailed: "Не удалось прочитать фото.",
      qrScannerStatusCameraFailed: "Не удалось включить камеру: {error}",
      qrScannerStatusNeedSecure: "Для камеры откройте MB Bank по localhost/https. Можно использовать \"Сканировать с фото\".",
      cameraAccessGranted: "Доступ к камере получен.",
      cameraAccessDenied: "Доступ к камере запрещен. Разрешите его в настройках браузера для этого сайта.",
      cameraAccessFailed: "Не удалось запросить доступ к камере: {error}",
      cameraAccessUnavailable: "Камера недоступна в этом браузере.",
      scanQrFromFileBtn: "Сканировать с фото",
      closeQrScannerBtn: "Закрыть сканер",
      transferSubmitBtn: "Перевести",
      transferSubmitQrBtn: "Оплатить QR",
      closeTransferModalBtn: "Закрыть",
      placeholderCardId: "12 цифр",
      enterCardId: "Введите ID карты.",
      invalidCardId: "ID карты должен содержать 12 цифр.",
      enterQrPayload: "Вставьте QR-код MDM.",
      qrPaySuccess: "QR-оплата выполнена. Заказ: {order}",
      qrPayAlreadySuccess: "Этот QR уже был оплачен. Заказ: {order}",
      qrPayFailed: "Ошибка QR-оплаты: {error}",
      easterCodeUnlocked: "Пасхалка: секретный код активировал неоновый режим.",
      easterTitleUnlocked: "Пасхалка: заголовок активировал неоновый режим.",
      easterLuckyTransfer: "Пасхалка: lucky-перевод! Неоновый режим включён.",
    },
    en: {
      authTitle: "Sign In / Sign Up",
      tabLogin: "Sign In",
      tabRegister: "Sign Up",
      loginUsernameLabel: "Username",
      loginPasswordLabel: "Password",
      loginBtn: "Sign In",
      registerUsernameLabel: "Username (A-Z, a-z, 0-9, _)",
      registerPasswordLabel: "Password (min 6)",
      registerBtn: "Create Account",
      profileTitleText: "Profile",
      balanceLabel: "Balance",
      openProfileModalBtn: "Profile",
      openSettingsModalBtn: "Settings",
      logoutBtn: "Logout",
      transferTitle: "Transfer",
      toUserLabel: "To user",
      transferAmountLabel: "Amount (RUB)",
      transferDescriptionLabel: "Description",
      transferBtn: "Make Transfer",
      adminPanelTitle: "Admin Panel",
      adminUserLabel: "User",
      adminAmountLabel: "Amount (RUB)",
      adminRoleLabel: "Role",
      adminDescriptionLabel: "Description",
      adminAddMoneyBtn: "Add Money",
      adminSubtractMoneyBtn: "Subtract Money",
      openBankReserveModalBtn: "Bank Reserve",
      adminSetRoleBtn: "Apply User Role",
      adminClearTransfersBtn: "Clear Transfers",
      usersTitle: "Users",
      usersHeadUser: "User",
      usersHeadBalance: "Balance",
      usersHeadRole: "Role",
      transfersTitle: "Latest Transfers",
      txHeadTime: "Time",
      txHeadFrom: "From",
      txHeadTo: "To",
      txHeadAmount: "Amount",
      txHeadStatus: "Status",
      txHeadDescription: "Description",
      reserveModalTitle: "Bank Reserve (hidden account)",
      reserveCurrentLabel: "Current amount",
      reserveNewLabel: "New amount (RUB)",
      saveBankReserveBtn: "Save",
      closeBankReserveModalBtn: "Close",
      profileModalTitle: "My Profile",
      profileUploadAvatarLabel: "Upload avatar",
      profileAvatarHint: "Image up to 1.5 MB.",
      profileRemoveAvatarBtn: "Remove Avatar",
      saveProfileBtn: "Save Profile",
      closeProfileModalBtn: "Close",
      settingsModalTitle: "Settings",
      settingsThemeLabel: "Theme",
      settingsLanguageLabel: "Language",
      saveSettingsBtn: "Save Settings",
      closeSettingsModalBtn: "Close",
      placeholderOptionalNote: "Optional note",
      placeholderOptionalAdminNote: "Optional admin note",
      empty: "Empty",
      incoming: "Incoming",
      outgoing: "Outgoing",
      from: "from",
      to: "to",
      signedIn: "Signed in: {username}",
      welcomeBack: "Welcome back, {username}",
      signInFailed: "Sign in failed: {error}",
      profileCreated: "Profile created: {username}",
      registrationFailed: "Registration failed: {error}",
      loggedOut: "Logged out.",
      signInFirst: "Sign in first.",
      selectRecipient: "Select recipient.",
      enterAmount: "Enter amount.",
      transferDone: "Transfer {amount} RUB -> {to} done.",
      transferSent: "Transfer sent: {amount} RUB",
      transferFailed: "Transfer failed: {error}",
      adminOnly: "Admin only.",
      selectUserAndAmount: "Select user and amount.",
      addDone: "Added {amount} RUB to {to}.",
      addFailed: "Add failed: {error}",
      subtractDone: "Subtracted {amount} RUB from {to}.",
      subtractFailed: "Subtract failed: {error}",
      selectUserAndRole: "Select user and role.",
      roleUpdated: "Role updated: {to} -> {role}",
      roleUpdateFailed: "Role update failed: {error}",
      transfersCleared: "Transfers cleared.",
      clearFailed: "Clear failed: {error}",
      enterReserveAmount: "Enter reserve amount.",
      reserveSet: "Bank reserve set to {amount} RUB.",
      reserveUpdated: "Bank reserve updated.",
      reserveUpdateFailed: "Reserve update failed: {error}",
      profileSaved: "Profile saved.",
      profileUpdated: "Profile updated.",
      profileSaveFailed: "Profile save failed: {error}",
      settingsSaved: "Settings saved.",
      settingsSaveFailed: "Settings save failed: {error}",
      stateSynced: "State synced.",
      sessionExpired: "Session expired. Sign in again.",
      syncFailed: "Sync failed: {error}",
      publicLoaded: "Public state loaded.",
      loadFailed: "Load failed: {error}",
      onlyImage: "Please choose an image file.",
      imageTooLarge: "Image is too large (max 1.5 MB).",
      avatarSelected: "Avatar selected. Save profile to apply.",
      avatarReadFailed: "Failed to read image.",
      avatarWillBeRemoved: "Avatar will be removed. Save profile to apply.",
      ready: "Ready.",
      enterUsernamePassword: "Enter username and password.",
      roleBuyer: "buyer",
      roleSeller: "seller",
      roleAdmin: "admin",
      themeNight: "Night",
      themeLight: "Light",
      themeMint: "Mint",
      myCardLabel: "Card ID",
      openTransferBtn: "Make Transfer",
      transferModalTitle: "Make Transfer",
      transferByUserTab: "By Username",
      transferByCardTab: "By Card ID",
      transferByQrTab: "MDM QR",
      toCardIdLabel: "Card ID",
      qrPayloadLabel: "MDM QR payload",
      qrPayloadHint: "Paste scanned code from MB Bank scanner (MDMQR:...).",
      requestCameraAccessBtn: "Request camera access",
      openQrScannerBtn: "Scan with camera",
      qrScannerTitle: "MDM QR scanner",
      qrScannerSubtitle: "Point your camera at the QR code, payment will be processed automatically.",
      qrScannerStatusStarting: "Starting camera...",
      qrScannerStatusReady: "Camera is active. Place QR inside the frame.",
      qrScannerStatusScanned: "QR detected. Processing payment...",
      qrScannerStatusNoSupport: "Scanner unavailable: this browser does not support QR detection.",
      qrScannerStatusNoMedia: "Camera API is not available in this browser.",
      qrScannerStatusNoCodeInImage: "No QR code found in selected image.",
      qrScannerStatusReadImageFailed: "Failed to read image.",
      qrScannerStatusCameraFailed: "Could not start camera: {error}",
      qrScannerStatusNeedSecure: "Camera may require localhost/https. You can use \"Scan from photo\".",
      cameraAccessGranted: "Camera access granted.",
      cameraAccessDenied: "Camera access denied. Allow it in your browser site settings.",
      cameraAccessFailed: "Failed to request camera access: {error}",
      cameraAccessUnavailable: "Camera is not available in this browser.",
      scanQrFromFileBtn: "Scan from photo",
      closeQrScannerBtn: "Close scanner",
      transferSubmitBtn: "Send Transfer",
      transferSubmitQrBtn: "Pay QR",
      closeTransferModalBtn: "Close",
      placeholderCardId: "12 digits",
      enterCardId: "Enter card ID.",
      invalidCardId: "Card ID must contain 12 digits.",
      enterQrPayload: "Paste MDM QR payload.",
      qrPaySuccess: "QR payment completed. Order: {order}",
      qrPayAlreadySuccess: "This QR is already paid. Order: {order}",
      qrPayFailed: "QR payment failed: {error}",
      easterCodeUnlocked: "Easter egg: secret code enabled neon mode.",
      easterTitleUnlocked: "Easter egg: title clicks enabled neon mode.",
      easterLuckyTransfer: "Easter egg: lucky transfer! Neon mode enabled.",
    },
  };

  let token = localStorage.getItem(TOKEN_KEY) || "";
  let clientIp = "-";
  let revision = 0;
  let updatedAt = 0;
  let me = null;
  let profiles = [];
  let profileByName = {};
  let profileByCardId = {};
  let transfers = [];
  let bankReserve = 0;
  let busy = false;
  let knownTransferIds = new Set();
  let freshTransferIds = new Set();
  let transferWatchReady = false;
  let avatarDraft = null;
  let transferMode = "username";
  let currentLanguage = localStorage.getItem(LANG_KEY) || "ru";
  let audioCtx = null;
  let sfxArmed = false;
  let secretCodeBuffer = [];
  let titleTapCount = 0;
  let titleTapTimer = null;
  let easterModeTimer = null;
  let prevAuthVisible = null;
  let prevBalance = null;
  let adminRoleDirty = false;
  let qrScannerStream = null;
  let qrScannerFrameReq = 0;
  let qrScannerRunning = false;
  let qrScannerReading = false;
  let qrScannerAutopay = false;
  let qrDetector = null;
  let qrScanCanvas = null;
  let qrScanCtx = null;

  const el = (id) => document.getElementById(id);

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeLanguage(lang) {
    const v = String(lang || "").toLowerCase();
    return v === "en" ? "en" : "ru";
  }

  function t(key, vars = {}) {
    const lang = normalizeLanguage(currentLanguage);
    const dict = I18N[lang] || I18N.en;
    let text = dict[key] || I18N.en[key] || key;
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value ?? ""));
    }
    return text;
  }

  function setText(id, key, vars = {}) {
    const node = el(id);
    if (node) {
      node.textContent = t(key, vars);
    }
  }

  function setPlaceholder(id, key) {
    const node = el(id);
    if (node) {
      node.placeholder = t(key);
    }
  }

  function applyLanguage(lang) {
    currentLanguage = normalizeLanguage(lang);
    localStorage.setItem(LANG_KEY, currentLanguage);
    document.documentElement.lang = currentLanguage;

    setText("authTitle", "authTitle");
    setText("tabLogin", "tabLogin");
    setText("tabRegister", "tabRegister");
    setText("loginUsernameLabel", "loginUsernameLabel");
    setText("loginPasswordLabel", "loginPasswordLabel");
    setText("loginBtn", "loginBtn");
    setText("registerUsernameLabel", "registerUsernameLabel");
    setText("registerPasswordLabel", "registerPasswordLabel");
    setText("registerBtn", "registerBtn");
    setText("profileTitleText", "profileTitleText");
    setText("balanceLabel", "balanceLabel");
    setText("myCardLabel", "myCardLabel");
    setText("openProfileModalBtn", "openProfileModalBtn");
    setText("openSettingsModalBtn", "openSettingsModalBtn");
    setText("logoutBtn", "logoutBtn");
    setText("transferTitle", "transferTitle");
    setText("toUserLabel", "toUserLabel");
    setText("toCardIdLabel", "toCardIdLabel");
    setText("transferAmountLabel", "transferAmountLabel");
    setText("transferDescriptionLabel", "transferDescriptionLabel");
    setText("transferBtn", "openTransferBtn");
    setText("transferModalTitle", "transferModalTitle");
    setText("transferByUserTab", "transferByUserTab");
    setText("transferByCardTab", "transferByCardTab");
    setText("transferByQrTab", "transferByQrTab");
    setText("qrPayloadLabel", "qrPayloadLabel");
    setText("qrPayloadHint", "qrPayloadHint");
    setText("requestCameraAccessBtn", "requestCameraAccessBtn");
    setText("openQrScannerBtn", "openQrScannerBtn");
    setText("transferSubmitBtn", "transferSubmitBtn");
    setText("closeTransferModalBtn", "closeTransferModalBtn");
    setText("qrScannerTitle", "qrScannerTitle");
    setText("qrScannerSubtitle", "qrScannerSubtitle");
    setText("scanQrFromFileBtn", "scanQrFromFileBtn");
    setText("closeQrScannerBtn", "closeQrScannerBtn");
    setText("adminPanelTitle", "adminPanelTitle");
    setText("adminUserLabel", "adminUserLabel");
    setText("adminAmountLabel", "adminAmountLabel");
    setText("adminRoleLabel", "adminRoleLabel");
    setText("adminDescriptionLabel", "adminDescriptionLabel");
    setText("adminAddMoneyBtn", "adminAddMoneyBtn");
    setText("adminSubtractMoneyBtn", "adminSubtractMoneyBtn");
    setText("openBankReserveModalBtn", "openBankReserveModalBtn");
    setText("adminSetRoleBtn", "adminSetRoleBtn");
    setText("adminClearTransfersBtn", "adminClearTransfersBtn");
    setText("usersTitle", "usersTitle");
    setText("usersHeadUser", "usersHeadUser");
    setText("usersHeadBalance", "usersHeadBalance");
    setText("usersHeadRole", "usersHeadRole");
    setText("transfersTitle", "transfersTitle");
    setText("txHeadTime", "txHeadTime");
    setText("txHeadFrom", "txHeadFrom");
    setText("txHeadTo", "txHeadTo");
    setText("txHeadAmount", "txHeadAmount");
    setText("txHeadStatus", "txHeadStatus");
    setText("txHeadDescription", "txHeadDescription");
    setText("reserveModalTitle", "reserveModalTitle");
    setText("reserveCurrentLabel", "reserveCurrentLabel");
    setText("reserveNewLabel", "reserveNewLabel");
    setText("saveBankReserveBtn", "saveBankReserveBtn");
    setText("closeBankReserveModalBtn", "closeBankReserveModalBtn");
    setText("profileModalTitle", "profileModalTitle");
    setText("profileUploadAvatarLabel", "profileUploadAvatarLabel");
    setText("profileAvatarHint", "profileAvatarHint");
    setText("profileRemoveAvatarBtn", "profileRemoveAvatarBtn");
    setText("saveProfileBtn", "saveProfileBtn");
    setText("closeProfileModalBtn", "closeProfileModalBtn");
    setText("settingsModalTitle", "settingsModalTitle");
    setText("settingsThemeLabel", "settingsThemeLabel");
    setText("settingsLanguageLabel", "settingsLanguageLabel");
    setText("saveSettingsBtn", "saveSettingsBtn");
    setText("closeSettingsModalBtn", "closeSettingsModalBtn");

    setPlaceholder("transferDescription", "placeholderOptionalNote");
    setPlaceholder("toCardIdInput", "placeholderCardId");
    setPlaceholder("qrPayloadInput", "enterQrPayload");
    setPlaceholder("adminTransferDescription", "placeholderOptionalAdminNote");
    setPlaceholder("loginUsername", "loginUsernameLabel");
    setPlaceholder("loginPassword", "loginPasswordLabel");
    setPlaceholder("registerUsername", "loginUsernameLabel");
    setPlaceholder("registerPassword", "loginPasswordLabel");

    const themeSel = el("themeSelect");
    if (themeSel && themeSel.options.length >= 3) {
      themeSel.options[0].textContent = t("themeNight");
      themeSel.options[1].textContent = t("themeLight");
      themeSel.options[2].textContent = t("themeMint");
    }

    const roleSel = el("adminRoleSelect");
    if (roleSel && roleSel.options.length >= 3) {
      roleSel.options[0].textContent = t("roleBuyer");
      roleSel.options[1].textContent = t("roleSeller");
      roleSel.options[2].textContent = t("roleAdmin");
    }

    updateTransferSubmitButtonLabel();
  }

  function ensureAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function armSfx() {
    if (sfxArmed) {
      return;
    }
    sfxArmed = true;
    ensureAudioContext();
  }

  function playSfxNotes(notes, opts = {}) {
    if (!sfxArmed || !Array.isArray(notes) || notes.length === 0) {
      return;
    }
    try {
      ensureAudioContext();
      const now = audioCtx.currentTime;
      const wave = opts.wave || "triangle";
      const step = Number(opts.step || 0.05);
      const noteLen = Number(opts.noteLen || 0.11);
      const gainValue = Math.max(0.02, Math.min(0.25, Number(opts.gain || 0.1)));
      const master = audioCtx.createGain();
      master.gain.setValueAtTime(gainValue, now);
      master.connect(audioCtx.destination);
      notes.forEach((freq, index) => {
        const start = now + index * step;
        const end = start + noteLen;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(Math.max(90, Number(freq) || 220), start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(1, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(end + 0.01);
      });
    } catch (_err) {
      // ignore audio errors
    }
  }

  function playSfx(kind) {
    switch (kind) {
      case "click":
        playSfxNotes([420], { wave: "sine", noteLen: 0.05, gain: 0.06 });
        break;
      case "ok":
        playSfxNotes([650, 860], { wave: "triangle", noteLen: 0.09, step: 0.055, gain: 0.1 });
        break;
      case "err":
        playSfxNotes([360, 250], { wave: "square", noteLen: 0.08, step: 0.05, gain: 0.08 });
        break;
      case "incoming":
        playSfxNotes([760, 950, 1190], { wave: "triangle", noteLen: 0.08, step: 0.045, gain: 0.11 });
        break;
      case "outgoing":
        playSfxNotes([560, 470], { wave: "sine", noteLen: 0.08, step: 0.06, gain: 0.09 });
        break;
      case "easter":
        playSfxNotes([523, 659, 784, 1046], { wave: "triangle", noteLen: 0.09, step: 0.045, gain: 0.13 });
        break;
      default:
        break;
    }
  }

  function spawnFxCoins(count = 14) {
    const layer = el("fxLayer");
    if (!layer) {
      return;
    }
    const symbols = ["₽", "✨", "💸", "💳"];
    const safeCount = Math.max(4, Math.min(60, Number(count) || 14));
    for (let i = 0; i < safeCount; i += 1) {
      const node = document.createElement("span");
      node.className = "fx-coin";
      node.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      node.style.left = `${(Math.random() * 92 + 4).toFixed(2)}vw`;
      node.style.setProperty("--dx", `${((Math.random() * 2 - 1) * 140).toFixed(2)}px`);
      node.style.setProperty("--rot", `${((Math.random() * 2 - 1) * 660).toFixed(0)}deg`);
      node.style.setProperty("--dur", `${Math.round(950 + Math.random() * 850)}ms`);
      layer.appendChild(node);
      setTimeout(() => node.remove(), 2100);
    }
  }

  function activateEasterMode(source = "code") {
    if (easterModeTimer) {
      clearTimeout(easterModeTimer);
    }
    document.body.classList.add("egg-mode");
    spawnFxCoins(26);
    playSfx("easter");
    const msgKey = source === "title" ? "easterTitleUnlocked" : source === "lucky" ? "easterLuckyTransfer" : "easterCodeUnlocked";
    toast(t(msgKey), "ok", "easter");
    easterModeTimer = setTimeout(() => {
      document.body.classList.remove("egg-mode");
    }, EASTER_MODE_MS);
  }

  function handleSecretCode(eventCode) {
    if (!eventCode) {
      return;
    }
    secretCodeBuffer.push(eventCode);
    if (secretCodeBuffer.length > SECRET_CODE.length) {
      secretCodeBuffer.shift();
    }
    const matched = SECRET_CODE.every((code, index) => secretCodeBuffer[index] === code);
    if (!matched) {
      return;
    }
    secretCodeBuffer = [];
    activateEasterMode("code");
  }

  function handleTitleTapEaster() {
    titleTapCount += 1;
    if (titleTapTimer) {
      clearTimeout(titleTapTimer);
    }
    titleTapTimer = setTimeout(() => {
      titleTapCount = 0;
    }, 1800);
    if (titleTapCount < TITLE_TAP_TARGET) {
      return;
    }
    titleTapCount = 0;
    activateEasterMode("title");
  }

  function status(text, isError) {
    const box = el("statusBox");
    const cls = isError ? "err" : "ok";
    box.innerHTML = `<span class="${cls}">${esc(text)}</span>`;
    box.classList.remove("flash-ok", "flash-err");
    void box.offsetWidth;
    box.classList.add(isError ? "flash-err" : "flash-ok");
  }

  function toast(text, type = "ok", sound = "") {
    const wrap = el("toastContainer");
    const node = document.createElement("div");
    const isErr = type === "err";
    node.className = `toast ${isErr ? "err" : "ok"}`;
    node.textContent = text;
    wrap.appendChild(node);
    playSfx(sound || (isErr ? "err" : "ok"));
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(8px)";
    }, 2800);
    setTimeout(() => node.remove(), 3200);
  }

  function animateNode(node, className = "panel-enter") {
    if (!node) {
      return;
    }
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    setTimeout(() => {
      node.classList.remove(className);
    }, 420);
  }

  function animateVisibleCards() {
    const cards = Array.from(document.querySelectorAll(".card")).filter(
      (node) => node && !node.classList.contains("hidden") && node.offsetParent !== null
    );
    cards.forEach((node, index) => {
      node.style.setProperty("--reveal-index", String(index));
      node.classList.remove("reveal");
      void node.offsetWidth;
      node.classList.add("reveal");
    });
  }

  function setTab(tab) {
    const login = tab === "login";
    el("loginPanel").classList.toggle("hidden", !login);
    el("registerPanel").classList.toggle("hidden", login);
    el("tabLogin").classList.toggle("active", login);
    el("tabRegister").classList.toggle("active", !login);
    el("tabLogin").classList.toggle("secondary", !login);
    el("tabRegister").classList.toggle("secondary", login);
    animateNode(login ? el("loginPanel") : el("registerPanel"));
  }

  function setToken(value) {
    token = value || "";
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  async function apiGetPublic() {
    const res = await fetch(API, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  async function apiPost(action, payload = {}) {
    const body = { action, ...payload };
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function applyTheme(theme) {
    const t = String(theme || "night").toLowerCase();
    document.body.setAttribute("data-theme", ["night", "light", "mint"].includes(t) ? t : "night");
  }

  function closeModalById(id) {
    if (id === "qrScannerModal") {
      stopQrScanner();
    }
    if (id === "transferModal") {
      stopQrScanner();
      el("qrScannerModal").classList.add("hidden");
    }
    el(id).classList.add("hidden");
  }

  function openModalById(id) {
    const node = el(id);
    node.classList.remove("hidden");
    animateNode(node.querySelector(".modal-card"));
  }

  function buildProfileMap() {
    const map = {};
    for (const p of profiles) {
      if (p && p.username) {
        map[p.username] = p;
      }
    }
    return map;
  }

  function buildCardIdMap() {
    const map = {};
    for (const p of profiles) {
      if (!p || !p.username) {
        continue;
      }
      const cardId = normalizeCardId(p.cardId);
      if (cardId) {
        map[cardId] = p;
      }
    }
    return map;
  }

  function normalizeCardId(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 12);
  }

  function avatarMarkup(name, avatar, large = false) {
    const cls = large ? "avatar large" : "avatar";
    const initial = esc((String(name || "?").trim().charAt(0) || "?").toUpperCase());
    if (avatar) {
      return `<span class="${cls}"><img src="${esc(avatar)}" alt="avatar" /></span>`;
    }
    return `<span class="${cls}">${initial}</span>`;
  }

  function userCellMarkup(username) {
    const safe = String(username || "-");
    if (safe === "BANK_RESERVE" || safe.startsWith("ADMIN:")) {
      return `<div class="user-cell">${avatarMarkup(safe, "", false)}<span>${esc(safe)}</span></div>`;
    }
    const p = profileByName[safe];
    const avatar = p ? String(p.avatar || "") : "";
    return `<div class="user-cell">${avatarMarkup(safe, avatar, false)}<span>${esc(safe)}</span></div>`;
  }

  function collectTransferNotifications() {
    const nextIds = new Set();
    const freshIds = new Set();
    for (const tx of transfers) {
      const id = String(tx.id || "");
      if (!id) {
        continue;
      }
      nextIds.add(id);
      if (!transferWatchReady || knownTransferIds.has(id) || !me || !me.username) {
        continue;
      }
      freshIds.add(id);
      const amount = (Number(tx.amountCents || 0) / 100).toFixed(2);
      const desc = tx.description ? ` (${tx.description})` : "";
      if (tx.to === me.username) {
        toast(`${t("incoming")}: +${amount} RUB ${t("from")} ${tx.from}${desc}`, "ok", "incoming");
        spawnFxCoins(8);
      } else if (tx.from === me.username) {
        toast(`${t("outgoing")}: -${amount} RUB ${t("to")} ${tx.to}${desc}`, "ok", "outgoing");
      }
    }
    freshTransferIds = freshIds;
    knownTransferIds = nextIds;
    transferWatchReady = true;
  }

  function applyMbState(mbBank, ip) {
    const safe = mbBank && typeof mbBank === "object" ? mbBank : {};
    revision = Number(safe.revision || 0);
    updatedAt = Number(safe.updatedAt || 0);
    profiles = Array.isArray(safe.profiles) ? safe.profiles : [];
    transfers = Array.isArray(safe.transfers) ? safe.transfers : [];
    me = safe.me && typeof safe.me === "object" ? safe.me : null;
    bankReserve = Number(safe.bankReserve || 0);
    profileByName = buildProfileMap();
    profileByCardId = buildCardIdMap();
    if (ip) {
      clientIp = ip;
    }
    collectTransferNotifications();
    render();
  }

  function syncAdminRoleSelection(force = false) {
    if (!me || !me.isAdmin) {
      return;
    }
    const selectedUser = el("adminUserSelect").value;
    const target = profileByName[selectedUser];
    const role = String((target && target.role) || "buyer");
    const roleSel = el("adminRoleSelect");
    const normalizedRole = ["buyer", "seller", "admin"].includes(role) ? role : "buyer";
    if (force || !adminRoleDirty) {
      roleSel.value = normalizedRole;
    }
    const isRootAdmin = selectedUser === "Goodog2013";
    for (const opt of Array.from(roleSel.options)) {
      if (!opt) {
        continue;
      }
      opt.disabled = isRootAdmin && opt.value !== "admin";
    }
    if (isRootAdmin) {
      roleSel.value = "admin";
      adminRoleDirty = false;
    }
  }

  function render() {
    el("clientIp").textContent = clientIp || "-";
    el("revision").textContent = String(revision);
    el("updatedAt").textContent = updatedAt ? new Date(updatedAt * 1000).toLocaleString() : "-";

    const isAuth = Boolean(me && me.username);
    el("authCard").classList.toggle("hidden", isAuth);
    el("appCard").classList.toggle("hidden", !isAuth);
    const authChanged = prevAuthVisible !== isAuth;

    if (!isAuth) {
      applyTheme("night");
      applyLanguage(currentLanguage || "ru");
      el("meCardId").textContent = "-";
      closeModalById("profileModal");
      closeModalById("settingsModal");
      closeModalById("transferModal");
      closeModalById("qrScannerModal");
      closeModalById("bankReserveModal");
      prevBalance = null;
      if (authChanged) {
        animateNode(el("authCard"));
        animateVisibleCards();
      }
      prevAuthVisible = isAuth;
      return;
    }

    const meRole = String(me.role || (me.isAdmin ? "admin" : "buyer"));
    applyTheme((me.settings && me.settings.theme) || "night");
    applyLanguage((me.settings && me.settings.language) || currentLanguage || "ru");
    el("meUsername").textContent = me.username;
    const balanceNum = Number(me.balance || 0);
    el("meBalance").textContent = balanceNum.toFixed(2);
    if (prevBalance !== null && Math.abs(balanceNum - prevBalance) > 0.00001) {
      animateNode(el("meBalance"), "balance-pop");
    }
    prevBalance = balanceNum;
    el("meCardId").textContent = normalizeCardId(me.cardId) || "-";
    el("meRole").textContent = (ROLE_LABELS[currentLanguage] && ROLE_LABELS[currentLanguage][meRole]) || meRole;
    el("meRole").classList.remove("hidden");

    el("adminPanel").classList.toggle("hidden", !me.isAdmin);
    el("usersPanel").classList.toggle("hidden", !me.isAdmin);

    const recipients = profiles.filter((p) => p && p.username && p.username !== me.username);
    const toSel = el("toUserSelect");
    const prevTo = toSel.value;
    toSel.innerHTML = "";
    for (const p of recipients) {
      const opt = document.createElement("option");
      opt.value = p.username;
      const cardId = normalizeCardId(p.cardId);
      const cardPart = cardId ? ` • ID ${cardId}` : "";
      opt.textContent = `${p.username} - ${Number(p.balance || 0).toFixed(2)} RUB${cardPart}`;
      toSel.appendChild(opt);
    }
    if (toSel.options.length > 0) {
      toSel.value = Array.from(toSel.options).some((o) => o.value === prevTo) ? prevTo : toSel.options[0].value;
    }

    const profileRows = profiles
      .map((p) => {
        const role = String(p.role || (p.isAdmin ? "admin" : "buyer"));
        return `<tr>
          <td>${userCellMarkup(p.username)}</td>
          <td>${esc(Number(p.balance || 0).toFixed(2))} RUB</td>
          <td><span class="pill">${esc((ROLE_LABELS[currentLanguage] && ROLE_LABELS[currentLanguage][role]) || role)}</span></td>
        </tr>`;
      })
      .join("");
    el("profilesTbody").innerHTML = profileRows || `<tr><td colspan="3" class="muted">${esc(t("empty"))}</td></tr>`;

    const txRows = [...transfers]
      .reverse()
      .slice(0, 140)
      .map((t) => {
        const desc = String(t.description || "");
        const rowClass = freshTransferIds.has(String(t.id || "")) ? ` class="tx-flash"` : "";
        return `<tr${rowClass}>
          <td>${esc(t.timestamp ? new Date(Number(t.timestamp) * 1000).toLocaleString() : "-")}</td>
          <td>${userCellMarkup(t.from || "-")}</td>
          <td>${userCellMarkup(t.to || "-")}</td>
          <td>${esc((Number(t.amountCents || 0) / 100).toFixed(2))} RUB</td>
          <td>${esc(t.status || "-")}</td>
          <td>${esc(desc)}</td>
        </tr>`;
      })
      .join("");
    el("transfersTbody").innerHTML = txRows || `<tr><td colspan="6" class="muted">${esc(t("empty"))}</td></tr>`;

    if (me.isAdmin) {
      const adminSel = el("adminUserSelect");
      const prevAdmin = adminSel.value;
      adminSel.innerHTML = "";
      for (const p of profiles) {
        if (!p || !p.username) {
          continue;
        }
        const opt = document.createElement("option");
        opt.value = p.username;
        opt.textContent = `${p.username} - ${Number(p.balance || 0).toFixed(2)} RUB`;
        adminSel.appendChild(opt);
      }
      if (adminSel.options.length > 0) {
        adminSel.value = Array.from(adminSel.options).some((o) => o.value === prevAdmin)
          ? prevAdmin
          : adminSel.options[0].value;
      }
      const selectedChanged = adminSel.value !== prevAdmin;
      if (selectedChanged) {
        adminRoleDirty = false;
      }
      syncAdminRoleSelection(selectedChanged);
      el("bankReserveValue").textContent = bankReserve.toFixed(2);
      if (el("bankReserveModal").classList.contains("hidden")) {
        el("bankReserveInput").value = bankReserve.toFixed(2);
      }
    } else {
      closeModalById("bankReserveModal");
    }

    if (el("settingsModal").classList.contains("hidden")) {
      el("themeSelect").value = (me.settings && me.settings.theme) || "night";
      el("languageSelect").value = (me.settings && me.settings.language) || currentLanguage || "ru";
    }
    if (authChanged) {
      animateNode(el("appCard"));
      animateVisibleCards();
    }
    prevAuthVisible = isAuth;
  }

  function profileAvatarPreview(avatarData, username) {
    el("profileAvatarPreview").innerHTML = avatarMarkup(username, avatarData, true);
  }

  function openProfileModal() {
    if (!me || !me.username) {
      return;
    }
    avatarDraft = null;
    el("profileAvatarFile").value = "";
    profileAvatarPreview(String(me.avatar || ""), me.username);
    openModalById("profileModal");
  }

  function openSettingsModal() {
    if (!me || !me.username) {
      return;
    }
    el("themeSelect").value = (me.settings && me.settings.theme) || "night";
    el("languageSelect").value = (me.settings && me.settings.language) || currentLanguage || "ru";
    openModalById("settingsModal");
  }

  function openBankReserveModal() {
    if (!me || !me.isAdmin) {
      status(t("adminOnly"), true);
      return;
    }
    el("bankReserveValue").textContent = bankReserve.toFixed(2);
    el("bankReserveInput").value = bankReserve.toFixed(2);
    openModalById("bankReserveModal");
  }

  function updateTransferSubmitButtonLabel() {
    const submitBtn = el("transferSubmitBtn");
    if (!submitBtn) {
      return;
    }
    submitBtn.textContent = transferMode === "qr" ? t("transferSubmitQrBtn") : t("transferSubmitBtn");
  }

  function setTransferMode(mode) {
    transferMode = mode === "card" || mode === "qr" ? mode : "username";
    const byCard = transferMode === "card";
    const byQr = transferMode === "qr";
    if (!byQr) {
      stopQrScanner();
      el("qrScannerModal").classList.add("hidden");
    }

    el("transferByUserPanel").classList.toggle("hidden", byCard || byQr);
    el("transferByCardPanel").classList.toggle("hidden", !byCard);
    el("transferByQrPanel").classList.toggle("hidden", !byQr);
    el("transferAmountRow").classList.toggle("hidden", byQr);

    el("transferByUserTab").classList.toggle("active", !byCard && !byQr);
    el("transferByUserTab").classList.toggle("secondary", byCard || byQr);
    el("transferByCardTab").classList.toggle("active", byCard);
    el("transferByCardTab").classList.toggle("secondary", !byCard);
    el("transferByQrTab").classList.toggle("active", byQr);
    el("transferByQrTab").classList.toggle("secondary", !byQr);
    updateTransferSubmitButtonLabel();
  }

  function setQrScannerStatus(message, isError = false, vars = {}) {
    const node = el("qrScannerStatus");
    if (!node) {
      return;
    }
    const translated = I18N.ru[message] || I18N.en[message] ? t(message, vars) : String(message || "");
    node.textContent = translated;
    node.classList.toggle("err", Boolean(isError));
  }

  function getQrDetector() {
    if (qrDetector) {
      return qrDetector;
    }
    if (typeof window.BarcodeDetector !== "function") {
      return null;
    }
    try {
      qrDetector = new window.BarcodeDetector({ formats: ["qr_code"] });
      return qrDetector;
    } catch (_err) {
      try {
        qrDetector = new window.BarcodeDetector();
        return qrDetector;
      } catch (_err2) {
        return null;
      }
    }
  }

  function getQrCanvasContext(width = 320, height = 240) {
    const w = Math.max(2, Math.floor(Number(width) || 320));
    const h = Math.max(2, Math.floor(Number(height) || 240));
    if (!qrScanCanvas) {
      qrScanCanvas = document.createElement("canvas");
    }
    if (qrScanCanvas.width !== w || qrScanCanvas.height !== h) {
      qrScanCanvas.width = w;
      qrScanCanvas.height = h;
    }
    qrScanCtx = qrScanCtx || qrScanCanvas.getContext("2d", { willReadFrequently: true });
    return qrScanCtx;
  }

  function detectPayloadWithJsQrFromSource(source, width, height) {
    if (typeof window.jsQR !== "function") {
      return "";
    }
    const w = Math.max(2, Math.floor(Number(width) || 0));
    const h = Math.max(2, Math.floor(Number(height) || 0));
    if (!w || !h) {
      return "";
    }
    const ctx = getQrCanvasContext(w, h);
    if (!ctx) {
      return "";
    }
    try {
      ctx.drawImage(source, 0, 0, w, h);
      const image = ctx.getImageData(0, 0, w, h);
      const decoded = window.jsQR(image.data, w, h, { inversionAttempts: "attemptBoth" });
      return extractQrPayload(decoded && decoded.data ? decoded.data : "");
    } catch (_err) {
      return "";
    }
  }

  function hasAnyQrEngine() {
    return Boolean(getQrDetector() || typeof window.jsQR === "function");
  }

  function extractQrPayload(rawText) {
    const raw = String(rawText || "").trim();
    if (!raw) {
      return "";
    }
    const mdmMatch = raw.match(/MDMQR:[A-Za-z0-9_-]+/i);
    if (mdmMatch && mdmMatch[0]) {
      return String(mdmMatch[0]).trim();
    }
    return raw;
  }

  function detectPayloadFromBarcodes(items) {
    const values = Array.isArray(items)
      ? items.map((item) => String(item && item.rawValue ? item.rawValue : "").trim()).filter(Boolean)
      : [];
    if (!values.length) {
      return "";
    }
    const mdm = values.find((value) => value.toUpperCase().includes("MDMQR:"));
    return extractQrPayload(mdm || values[0]);
  }

  function stopQrScanner() {
    qrScannerRunning = false;
    qrScannerReading = false;
    if (qrScannerFrameReq) {
      cancelAnimationFrame(qrScannerFrameReq);
      qrScannerFrameReq = 0;
    }
    if (qrScannerStream) {
      for (const track of qrScannerStream.getTracks()) {
        try {
          track.stop();
        } catch (_err) {
          // ignore
        }
      }
      qrScannerStream = null;
    }
    const video = el("qrScannerVideo");
    if (video) {
      video.srcObject = null;
    }
  }

  async function onQrPayloadDetected(payload) {
    const code = extractQrPayload(payload);
    if (!code || qrScannerAutopay) {
      return;
    }
    qrScannerAutopay = true;
    stopQrScanner();
    closeModalById("qrScannerModal");
    el("qrPayloadInput").value = code;
    status(t("qrScannerStatusScanned"), false);
    try {
      await transfer();
    } finally {
      qrScannerAutopay = false;
    }
  }

  async function qrScannerTick() {
    if (!qrScannerRunning) {
      return;
    }
    const video = el("qrScannerVideo");
    const detector = getQrDetector();
    const canJsQr = typeof window.jsQR === "function";
    if (!video || (!detector && !canJsQr)) {
      qrScannerRunning = false;
      return;
    }
    if (video.readyState >= 2 && !qrScannerReading) {
      qrScannerReading = true;
      try {
        let payload = "";
        if (detector) {
          const found = await detector.detect(video);
          payload = detectPayloadFromBarcodes(found);
        } else if (canJsQr) {
          payload = detectPayloadWithJsQrFromSource(video, video.videoWidth || 640, video.videoHeight || 480);
        }
        if (payload) {
          await onQrPayloadDetected(payload);
          return;
        }
      } catch (_err) {
        // keep scanning
      } finally {
        qrScannerReading = false;
      }
    }
    qrScannerFrameReq = requestAnimationFrame(qrScannerTick);
  }

  async function startQrScanner() {
    stopQrScanner();
    setQrScannerStatus("qrScannerStatusStarting", false);

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      setQrScannerStatus("qrScannerStatusNoMedia", true);
      return;
    }

    const host = String(location.hostname || "").toLowerCase();
    const insecure = !window.isSecureContext && host !== "localhost" && host !== "127.0.0.1";
    if (insecure) {
      setQrScannerStatus("qrScannerStatusNeedSecure", true);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      qrScannerStream = stream;
      const video = el("qrScannerVideo");
      if (!video) {
        stopQrScanner();
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch (_err) {
        // ignore autoplay errors
      }
      if (!hasAnyQrEngine()) {
        setQrScannerStatus("qrScannerStatusNoSupport", true);
        stopQrScanner();
        return;
      }
      qrScannerRunning = true;
      setQrScannerStatus("qrScannerStatusReady", false);
      qrScannerFrameReq = requestAnimationFrame(qrScannerTick);
    } catch (err) {
      setQrScannerStatus("qrScannerStatusCameraFailed", true, { error: err && err.message ? err.message : "unknown error" });
    }
  }

  async function requestCameraAccess() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      status(t("cameraAccessUnavailable"), true);
      return;
    }
    const host = String(location.hostname || "").toLowerCase();
    const insecure = !window.isSecureContext && host !== "localhost" && host !== "127.0.0.1";
    if (insecure) {
      status(t("qrScannerStatusNeedSecure"), true);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch (_err) {
          // ignore
        }
      }
      status(t("cameraAccessGranted"), false);
      toast(t("cameraAccessGranted"), "ok");
    } catch (err) {
      const name = String(err && err.name ? err.name : "");
      if (name === "NotAllowedError" || name === "SecurityError") {
        status(t("cameraAccessDenied"), true);
        toast(t("cameraAccessDenied"), "err");
        return;
      }
      status(t("cameraAccessFailed", { error: err && err.message ? err.message : "unknown error" }), true);
    }
  }

  function openQrScannerModal() {
    if (!token || !me) {
      status(t("signInFirst"), true);
      return;
    }
    if (transferMode !== "qr") {
      setTransferMode("qr");
    }
    openModalById("qrScannerModal");
    startQrScanner().catch(() => {});
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("IMAGE_DECODE_FAILED"));
      };
      image.src = url;
    });
  }

  async function scanQrFromFile(file) {
    const detector = getQrDetector();
    const canJsQr = typeof window.jsQR === "function";
    if (!detector && !canJsQr) {
      setQrScannerStatus("qrScannerStatusNoSupport", true);
      return;
    }
    try {
      let payload = "";
      if (detector) {
        let found = [];
        if (typeof createImageBitmap === "function") {
          const bitmap = await createImageBitmap(file);
          try {
            found = await detector.detect(bitmap);
          } finally {
            if (bitmap && typeof bitmap.close === "function") {
              bitmap.close();
            }
          }
        } else {
          const image = await loadImageFromFile(file);
          found = await detector.detect(image);
        }
        payload = detectPayloadFromBarcodes(found);
      } else {
        const image = await loadImageFromFile(file);
        payload = detectPayloadWithJsQrFromSource(
          image,
          image.naturalWidth || image.width || 1200,
          image.naturalHeight || image.height || 900
        );
      }
      if (!payload) {
        setQrScannerStatus("qrScannerStatusNoCodeInImage", true);
        return;
      }
      await onQrPayloadDetected(payload);
    } catch (_err) {
      setQrScannerStatus("qrScannerStatusReadImageFailed", true);
    }
  }

  function openTransferModal() {
    if (!token || !me) {
      status(t("signInFirst"), true);
      return;
    }
    stopQrScanner();
    el("qrScannerModal").classList.add("hidden");
    setTransferMode("username");
    if (!el("transferAmount").value.trim()) {
      el("transferAmount").value = "10.00";
    }
    el("transferDescription").value = "";
    el("toCardIdInput").value = "";
    el("qrPayloadInput").value = "";
    openModalById("transferModal");
  }

  async function login() {
    const username = el("loginUsername").value.trim();
    const password = el("loginPassword").value;
    if (!username || !password) {
      status(t("enterUsernamePassword"), true);
      return;
    }
    try {
      const data = await apiPost("login", { username, password });
      setToken(data.token || "");
      applyMbState(data.mbBank, data.clientIp);
      status(t("signedIn", { username }), false);
      toast(t("welcomeBack", { username }), "ok");
      spawnFxCoins(10);
    } catch (err) {
      status(t("signInFailed", { error: err.message }), true);
      toast(t("signInFailed", { error: err.message }), "err");
    }
  }

  async function registerProfile() {
    const username = el("registerUsername").value.trim();
    const password = el("registerPassword").value;
    if (!username || !password) {
      status(t("enterUsernamePassword"), true);
      return;
    }
    try {
      const data = await apiPost("register", { username, password });
      setToken(data.token || "");
      applyMbState(data.mbBank, data.clientIp);
      status(t("profileCreated", { username }), false);
      toast(t("profileCreated", { username }), "ok");
      spawnFxCoins(12);
    } catch (err) {
      status(t("registrationFailed", { error: err.message }), true);
      toast(t("registrationFailed", { error: err.message }), "err");
    }
  }

  async function logout() {
    try {
      if (token) {
        await apiPost("logout", { token });
      }
    } catch (_err) {
      // ignore
    }
    setToken("");
    me = null;
    transferWatchReady = false;
    knownTransferIds = new Set();
    freshTransferIds = new Set();
    await loadPublicState(true);
    status(t("loggedOut"), false);
  }

  async function transfer() {
    if (!token || !me) {
      status(t("signInFirst"), true);
      return;
    }
    if (transferMode === "qr") {
      const qrPayload = String(el("qrPayloadInput").value || "").trim();
      if (!qrPayload) {
        status(t("enterQrPayload"), true);
        return;
      }
      try {
        const data = await apiPost("mdm_qr_pay", { token, qrPayload });
        applyMbState(data.mbBank, data.clientIp);
        const orderCode = String(data?.order?.id || "")
          .trim()
          .slice(0, 8);
        const orderLabel = orderCode ? `#${orderCode}` : "—";
        if (data?.alreadyPaid) {
          status(t("qrPayAlreadySuccess", { order: orderLabel }), false);
          toast(t("qrPayAlreadySuccess", { order: orderLabel }), "ok");
        } else {
          status(t("qrPaySuccess", { order: orderLabel }), false);
          toast(t("qrPaySuccess", { order: orderLabel }), "ok");
        }
        spawnFxCoins(20);
        closeModalById("transferModal");
        el("qrPayloadInput").value = "";
      } catch (err) {
        status(t("qrPayFailed", { error: err.message }), true);
        toast(t("qrPayFailed", { error: err.message }), "err");
      }
      return;
    }

    const amount = el("transferAmount").value.trim();
    const description = el("transferDescription").value.trim();
    const amountNumber = Number(String(amount).replace(",", "."));
    if (!amount) {
      status(t("enterAmount"), true);
      return;
    }

    const payload = { token, amount, description };
    let targetLabel = "";

    if (transferMode === "card") {
      const toCardId = normalizeCardId(el("toCardIdInput").value);
      el("toCardIdInput").value = toCardId;
      if (!toCardId) {
        status(t("enterCardId"), true);
        return;
      }
      if (toCardId.length !== 12) {
        status(t("invalidCardId"), true);
        return;
      }
      payload.toCardId = toCardId;
      targetLabel = toCardId;
    } else {
      const toUsername = el("toUserSelect").value;
      if (!toUsername) {
        status(t("selectRecipient"), true);
        return;
      }
      payload.toUsername = toUsername;
      targetLabel = toUsername;
    }

    try {
      const data = await apiPost("transfer", payload);
      applyMbState(data.mbBank, data.clientIp);
      const toName = (data.transfer && data.transfer.to) || targetLabel;
      status(t("transferDone", { amount, to: toName }), false);
      toast(t("transferSent", { amount }), "ok");
      spawnFxCoins(16);
      if (amountNumber === 777 || amountNumber === 1337) {
        activateEasterMode("lucky");
      }
      closeModalById("transferModal");
      el("transferDescription").value = "";
      el("toCardIdInput").value = "";
    } catch (err) {
      status(t("transferFailed", { error: err.message }), true);
      toast(t("transferFailed", { error: err.message }), "err");
    }
  }

  async function adminAddMoney() {
    if (!token || !me || !me.isAdmin) {
      status(t("adminOnly"), true);
      return;
    }
    const toUsername = el("adminUserSelect").value;
    const amount = el("adminAddAmount").value.trim();
    const description = el("adminTransferDescription").value.trim();
    if (!toUsername || !amount) {
      status(t("selectUserAndAmount"), true);
      return;
    }
    try {
      const data = await apiPost("admin_add_balance", { token, toUsername, amount, description });
      applyMbState(data.mbBank, data.clientIp);
      status(t("addDone", { amount, to: toUsername }), false);
      toast(t("addDone", { amount, to: toUsername }), "ok");
      spawnFxCoins(12);
    } catch (err) {
      status(t("addFailed", { error: err.message }), true);
      toast(t("addFailed", { error: err.message }), "err");
    }
  }

  async function adminSubtractMoney() {
    if (!token || !me || !me.isAdmin) {
      status(t("adminOnly"), true);
      return;
    }
    const toUsername = el("adminUserSelect").value;
    const amount = el("adminAddAmount").value.trim();
    const description = el("adminTransferDescription").value.trim();
    if (!toUsername || !amount) {
      status(t("selectUserAndAmount"), true);
      return;
    }
    try {
      const data = await apiPost("admin_subtract_balance", { token, toUsername, amount, description });
      applyMbState(data.mbBank, data.clientIp);
      status(t("subtractDone", { amount, to: toUsername }), false);
      toast(t("subtractDone", { amount, to: toUsername }), "ok");
      spawnFxCoins(8);
    } catch (err) {
      status(t("subtractFailed", { error: err.message }), true);
      toast(t("subtractFailed", { error: err.message }), "err");
    }
  }

  async function adminSetRole() {
    if (!token || !me || !me.isAdmin) {
      status(t("adminOnly"), true);
      return;
    }
    const toUsername = el("adminUserSelect").value;
    const role = el("adminRoleSelect").value;
    if (!toUsername || !role) {
      status(t("selectUserAndRole"), true);
      return;
    }
    try {
      const data = await apiPost("admin_set_user_role", { token, toUsername, role });
      applyMbState(data.mbBank, data.clientIp);
      adminRoleDirty = false;
      status(t("roleUpdated", { to: toUsername, role }), false);
      toast(t("roleUpdated", { to: toUsername, role }), "ok");
    } catch (err) {
      status(t("roleUpdateFailed", { error: err.message }), true);
      toast(t("roleUpdateFailed", { error: err.message }), "err");
    }
  }

  async function adminClearTransfers() {
    if (!token || !me || !me.isAdmin) {
      status(t("adminOnly"), true);
      return;
    }
    try {
      const data = await apiPost("admin_clear_transfers", { token });
      applyMbState(data.mbBank, data.clientIp);
      status(t("transfersCleared"), false);
      toast(t("transfersCleared"), "ok");
      spawnFxCoins(14);
    } catch (err) {
      status(t("clearFailed", { error: err.message }), true);
      toast(t("clearFailed", { error: err.message }), "err");
    }
  }

  async function saveBankReserve() {
    if (!token || !me || !me.isAdmin) {
      status(t("adminOnly"), true);
      return;
    }
    const amount = el("bankReserveInput").value.trim();
    if (!amount) {
      status(t("enterReserveAmount"), true);
      return;
    }
    try {
      const data = await apiPost("admin_set_bank_reserve", { token, amount });
      applyMbState(data.mbBank, data.clientIp);
      closeModalById("bankReserveModal");
      status(t("reserveSet", { amount }), false);
      toast(t("reserveUpdated"), "ok");
      spawnFxCoins(10);
    } catch (err) {
      status(t("reserveUpdateFailed", { error: err.message }), true);
      toast(t("reserveUpdateFailed", { error: err.message }), "err");
    }
  }

  async function saveProfile() {
    if (!token || !me || !me.username) {
      status(t("signInFirst"), true);
      return;
    }
    const payload = { token };
    if (avatarDraft !== null) {
      payload.avatar = avatarDraft;
    }
    if (avatarDraft === null) {
      closeModalById("profileModal");
      return;
    }
    try {
      const data = await apiPost("update_profile", payload);
      applyMbState(data.mbBank, data.clientIp);
      closeModalById("profileModal");
      avatarDraft = null;
      status(t("profileSaved"), false);
      toast(t("profileUpdated"), "ok");
      spawnFxCoins(8);
    } catch (err) {
      status(t("profileSaveFailed", { error: err.message }), true);
      toast(t("profileSaveFailed", { error: err.message }), "err");
    }
  }

  async function saveSettings() {
    if (!token || !me || !me.username) {
      status(t("signInFirst"), true);
      return;
    }
    const theme = el("themeSelect").value;
    const language = el("languageSelect").value;
    try {
      const data = await apiPost("update_profile", { token, theme, language });
      applyMbState(data.mbBank, data.clientIp);
      closeModalById("settingsModal");
      status(t("settingsSaved"), false);
      toast(t("settingsSaved"), "ok");
      spawnFxCoins(8);
    } catch (err) {
      status(t("settingsSaveFailed", { error: err.message }), true);
      toast(t("settingsSaveFailed", { error: err.message }), "err");
    }
  }

  async function syncPrivateState(silent) {
    if (!token || busy) {
      return;
    }
    busy = true;
    try {
      const data = await apiPost("state", { token });
      applyMbState(data.mbBank, data.clientIp);
      if (!silent) {
        status(t("stateSynced"), false);
      }
    } catch (err) {
      if (err.status === 401) {
        setToken("");
        me = null;
        transferWatchReady = false;
        knownTransferIds = new Set();
        freshTransferIds = new Set();
        await loadPublicState(true);
        if (!silent) {
          status(t("sessionExpired"), true);
        }
      } else if (!silent) {
        status(t("syncFailed", { error: err.message }), true);
      }
    } finally {
      busy = false;
    }
  }

  async function loadPublicState(silent) {
    if (busy) {
      return;
    }
    busy = true;
    try {
      const data = await apiGetPublic();
      const meState = me;
      applyMbState(data.mbBank, data.clientIp);
      me = meState;
      render();
      if (!silent) {
        status(t("publicLoaded"), false);
      }
    } catch (err) {
      if (!silent) {
        status(t("loadFailed", { error: err.message }), true);
      }
    } finally {
      busy = false;
    }
  }

  function onAvatarFileChosen(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      status(t("onlyImage"), true);
      toast(t("onlyImage"), "err");
      return;
    }
    if (file.size > 1_500_000) {
      status(t("imageTooLarge"), true);
      toast(t("imageTooLarge"), "err");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      avatarDraft = String(reader.result || "");
      profileAvatarPreview(avatarDraft, me ? me.username : "?");
      status(t("avatarSelected"), false);
    };
    reader.onerror = () => {
      status(t("avatarReadFailed"), true);
      toast(t("avatarReadFailed"), "err");
    };
    reader.readAsDataURL(file);
  }

  function bindEvents() {
    document.addEventListener("pointerdown", armSfx, { passive: true });
    document.addEventListener("keydown", (event) => {
      armSfx();
      handleSecretCode(event.code);
    });
    document.addEventListener("click", (event) => {
      if (event.target && event.target.closest && event.target.closest("button")) {
        playSfx("click");
      }
    });

    const bankTitle = el("bankTitle");
    if (bankTitle) {
      bankTitle.addEventListener("click", handleTitleTapEaster);
    }

    el("tabLogin").addEventListener("click", () => setTab("login"));
    el("tabRegister").addEventListener("click", () => setTab("register"));
    el("loginBtn").addEventListener("click", login);
    el("registerBtn").addEventListener("click", registerProfile);
    el("logoutBtn").addEventListener("click", logout);
    el("transferBtn").addEventListener("click", openTransferModal);
    el("transferSubmitBtn").addEventListener("click", transfer);
    el("closeTransferModalBtn").addEventListener("click", () => closeModalById("transferModal"));
    el("transferByUserTab").addEventListener("click", () => setTransferMode("username"));
    el("transferByCardTab").addEventListener("click", () => setTransferMode("card"));
    el("transferByQrTab").addEventListener("click", () => setTransferMode("qr"));
    el("requestCameraAccessBtn").addEventListener("click", requestCameraAccess);
    el("openQrScannerBtn").addEventListener("click", openQrScannerModal);
    el("scanQrFromFileBtn").addEventListener("click", () => el("qrScanFileInput").click());
    el("closeQrScannerBtn").addEventListener("click", () => closeModalById("qrScannerModal"));
    el("qrScanFileInput").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }
      scanQrFromFile(file).finally(() => {
        event.target.value = "";
      });
    });
    el("toCardIdInput").addEventListener("input", (event) => {
      event.target.value = normalizeCardId(event.target.value);
    });

    el("openProfileModalBtn").addEventListener("click", openProfileModal);
    el("openSettingsModalBtn").addEventListener("click", openSettingsModal);
    el("closeProfileModalBtn").addEventListener("click", () => closeModalById("profileModal"));
    el("closeSettingsModalBtn").addEventListener("click", () => closeModalById("settingsModal"));
    el("saveProfileBtn").addEventListener("click", saveProfile);
    el("saveSettingsBtn").addEventListener("click", saveSettings);
    el("profileAvatarFile").addEventListener("change", onAvatarFileChosen);
    el("profileRemoveAvatarBtn").addEventListener("click", () => {
      avatarDraft = "";
      profileAvatarPreview("", me ? me.username : "?");
      status(t("avatarWillBeRemoved"), false);
    });

    el("adminAddMoneyBtn").addEventListener("click", adminAddMoney);
    el("adminSubtractMoneyBtn").addEventListener("click", adminSubtractMoney);
    el("adminSetRoleBtn").addEventListener("click", adminSetRole);
    el("adminClearTransfersBtn").addEventListener("click", adminClearTransfers);
    el("adminUserSelect").addEventListener("change", () => {
      adminRoleDirty = false;
      syncAdminRoleSelection(true);
    });
    el("adminRoleSelect").addEventListener("change", () => {
      adminRoleDirty = true;
    });

    el("openBankReserveModalBtn").addEventListener("click", openBankReserveModal);
    el("saveBankReserveBtn").addEventListener("click", saveBankReserve);
    el("closeBankReserveModalBtn").addEventListener("click", () => closeModalById("bankReserveModal"));

    for (const modalId of ["profileModal", "settingsModal", "transferModal", "qrScannerModal", "bankReserveModal"]) {
      el(modalId).addEventListener("click", (event) => {
        if (event.target && event.target.id === modalId) {
          closeModalById(modalId);
        }
      });
    }
  }

  async function init() {
    bindEvents();
    setTab("login");
    applyLanguage(currentLanguage || "ru");
    applyTheme("night");
    setTransferMode("username");
    await loadPublicState(true);
    if (token) {
      await syncPrivateState(true);
    } else {
      render();
    }
    setInterval(async () => {
      if (token) {
        await syncPrivateState(true);
      } else {
        await loadPublicState(true);
      }
    }, POLL_MS);
    status(t("ready"), false);
  }

  init();
})();

