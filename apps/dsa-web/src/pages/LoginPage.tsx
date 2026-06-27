import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "motion/react";
import { Lock, Mail, User, Loader2, TrendingUp, ShieldCheck, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "../components/common";
import { UiLanguageToggle } from "../components/i18n/UiLanguageToggle";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ParsedApiError } from "../api/error";
import { isParsedApiError } from "../api/error";
import { useAuth } from "../hooks";
import { useUiLanguage } from "../contexts/UiLanguageContext";

// ---------- Types ----------

type Mode = "login" | "register";

interface FormState {
  username: string;
  email: string;
  password: string;
  passwordConfirm: string;
}

// ---------- Sparkline SVG (decorative) ----------

const Sparkline = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 120 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M0 20L8 16L16 18L24 10L32 12L40 4L48 8L56 2L64 6L72 0L80 4L88 6L96 2L104 8L112 4L120 6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.25"
    />
  </svg>
);

// ---------- Background Grid ----------

const GridBackground = () => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothX = useSpring(mouseX, { damping: 50, stiffness: 100 });
  const smoothY = useSpring(mouseY, { damping: 50, stiffness: 100 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 20);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 20);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <motion.div
      style={{ x: smoothX, y: smoothY }}
      className="absolute inset-0 z-0 opacity-[0.03]"
    >
      <div className="h-full w-full bg-[linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] bg-[size:64px_64px]" />
    </motion.div>
  );
};

// ---------- Animated Orb ----------

const AnimatedOrb = ({
  className,
  delay = 0,
  size = 300,
  duration = 8,
}: {
  className?: string;
  delay?: number;
  size?: number;
  duration?: number;
}) => (
  <motion.div
    animate={{
      scale: [1, 1.2, 0.9, 1.1, 1],
      x: [0, 30, -20, 10, 0],
      y: [0, -20, 10, -30, 0],
    }}
    transition={{
      duration,
      repeat: Infinity,
      delay,
      ease: "easeInOut",
    }}
    className={`absolute rounded-full blur-[120px] ${className}`}
    style={{ width: size, height: size }}
  />
);

// ---------- Input Field ----------

interface AuthInputProps {
  id: string;
  type: string;
  icon: React.ReactNode;
  label: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  showToggle?: boolean;
  onToggle?: () => void;
  error?: string;
}

const AuthInput: React.FC<AuthInputProps> = ({
  id,
  type,
  icon,
  label,
  placeholder,
  value,
  onChange,
  disabled,
  autoFocus,
  autoComplete,
  showToggle,
  onToggle,
  error,
}) => (
  <div className="group">
    <label htmlFor={id} className="mb-1.5 block text-xs font-medium tracking-wide text-white/40 uppercase">
      {label}
    </label>
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-white/30">
        {icon}
      </div>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] py-3 pl-11 pr-11 text-sm text-white placeholder:text-white/20 outline-none transition-all duration-200 focus:border-white/[0.15] focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgba(255,255,255,0.02)] hover:border-white/[0.1] hover:bg-white/[0.04] disabled:opacity-40"
      />
      {showToggle !== undefined && (
        <button
          type="button"
          onClick={onToggle}
          className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-white/25 hover:text-white/50 transition-colors"
          tabIndex={-1}
        >
          {showToggle ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
    {error && <p className="mt-1 text-xs text-red-400/80">{error}</p>}
  </div>
);

// ---------- Main Component ----------

const LoginPage: React.FC = () => {
  const { login, register, passwordSet, setupState } = useAuth();
  const { t } = useUiLanguage();
  const [searchParams] = useSearchParams();
  const rawRedirect = searchParams.get("redirect") ?? "";
  const redirect = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : "/";

  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState<FormState>({
    username: "",
    email: "",
    password: "",
    passwordConfirm: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | ParsedApiError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  // Admin single-user fallback
  const isAdminSetup = setupState === "no_password" || !passwordSet;

  const updateField = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setError(null);
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof FormState, string>> = {};

    if (mode === "register" || (!isAdminSetup && mode === "login")) {
      if (!form.username.trim() || form.username.trim().length < 3) {
        errors.username = t("auth.validationUsernameLength");
      }
    }

    if (mode === "register") {
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        errors.email = t("auth.validationEmail");
      }
      if (form.password !== form.passwordConfirm) {
        errors.passwordConfirm = t("auth.validationPasswordMatch");
      }
    }

    if (!form.password || form.password.length < 6) {
      errors.password = t("auth.validationPasswordLength");
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      if (isAdminSetup) {
        // Admin first-time setup: password only
        const result = await login(form.password, form.passwordConfirm || undefined);
        if (result.success) {
        } else {
          setError(result.error ?? t("auth.errorSetupFailed"));
        }
      } else if (mode === "login") {
        const result = await login(form.username, form.password);
        if (result.success) {
        } else {
          setError(result.error ?? t("auth.errorLoginFailed"));
        }
      } else {
        // Register
        const result = await register(form.username, form.email, form.password);
        if (result.success) {
          // Auto-login after register
          const loginResult = await login(form.username, form.password);
          if (loginResult.success) {
          } else {
            setMode("login");
            setError(t("auth.errorAccountCreated"));
          }
        } else {
          setError(result.error ?? t("auth.errorRegisterFailed"));
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "register" : "login"));
    setError(null);
    setFieldErrors({});
  };

  // Page title
  useEffect(() => {
    document.title = mode === "login" ? `Cheentu — ${t("auth.pageTitleSignIn")}` : `Cheentu — ${t("auth.pageTitleRegister")}`;
  }, [mode]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#05070A] px-4 py-12 font-sans selection:bg-white/10">
      {/* Background layers */}
      <GridBackground />

      <AnimatedOrb
        className="-top-20 -right-20 bg-indigo-500/15"
        delay={0}
        size={400}
        duration={10}
      />
      <AnimatedOrb
        className="-bottom-32 -left-32 bg-emerald-500/10"
        delay={3}
        size={500}
        duration={12}
      />
      <AnimatedOrb
        className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-amber-500/5"
        delay={6}
        size={300}
        duration={14}
      />

      {/* Language toggle */}
      <div className="absolute right-4 top-4 z-30">
        <UiLanguageToggle />
      </div>

      {/* Brand mark — top left */}
      <div className="absolute left-6 top-6 z-20 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.06]">
          <TrendingUp className="h-4 w-4 text-white/70" />
        </div>
        <span className="text-sm font-medium tracking-wide text-white/50">Cheentu</span>
      </div>

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[400px]"
      >
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 shadow-2xl shadow-black/30 backdrop-blur-xl">
          {/* Card shimmer edge */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* Header */}
          <div className="mb-8 space-y-2">
            {isAdminSetup ? (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-white">{t("auth.adminSetupTitle")}</h1>
                <p className="text-sm leading-relaxed text-white/35">
                  {t("auth.adminSetupDesc")}
                </p>
              </>
            ) : (
              <>
                <div className="mb-1 flex items-center gap-3">
                  <Sparkline className="h-5 w-20 text-emerald-400/50" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-white">
                  {mode === "login" ? t("auth.welcomeBack") : t("auth.createAccount")}
                </h1>
                <p className="text-sm leading-relaxed text-white/35">
                  {mode === "login"
                    ? t("auth.signInDesc")
                    : t("auth.createAccountDesc")}
                </p>
              </>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="wait">
              {isAdminSetup ? (
                <motion.div
                  key="admin-setup"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-5"
                >
                  <AuthInput
                    id="password"
                    type={showPassword ? "text" : "password"}
                    icon={<Lock className="h-4 w-4" />}
                    label={t("auth.password")}
                    placeholder={t("auth.passwordPlaceholder")}
                    value={form.password}
                    onChange={updateField("password")}
                    disabled={isSubmitting}
                    autoFocus
                    autoComplete="new-password"
                    showToggle={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                    error={fieldErrors.password}
                  />
                  <AuthInput
                    id="passwordConfirm"
                    type={showPassword ? "text" : "password"}
                    icon={<Lock className="h-4 w-4" />}
                    label={t("auth.confirmPassword")}
                    placeholder={t("auth.passwordPlaceholder")}
                    value={form.passwordConfirm}
                    onChange={updateField("passwordConfirm")}
                    disabled={isSubmitting}
                    autoComplete="new-password"
                    error={fieldErrors.passwordConfirm}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: mode === "login" ? -10 : 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-5"
                >
                  {mode === "register" && (
                    <>
                      <AuthInput
                        id="username"
                        type="text"
                        icon={<User className="h-4 w-4" />}
                        label={t("auth.username")}
                        placeholder={t("auth.usernamePlaceholder")}
                        value={form.username}
                        onChange={updateField("username")}
                        disabled={isSubmitting}
                        autoFocus
                        autoComplete="username"
                        error={fieldErrors.username}
                      />
                      <AuthInput
                        id="email"
                        type="email"
                        icon={<Mail className="h-4 w-4" />}
                        label={t("auth.email")}
                        placeholder={t("auth.emailPlaceholder")}
                        value={form.email}
                        onChange={updateField("email")}
                        disabled={isSubmitting}
                        autoComplete="email"
                        error={fieldErrors.email}
                      />
                    </>
                  )}

                  {mode === "login" && (
                    <AuthInput
                      id="username"
                      type="text"
                      icon={<User className="h-4 w-4" />}
                      label={t("auth.username")}
                      placeholder={t("auth.usernamePlaceholder")}
                      value={form.username}
                      onChange={updateField("username")}
                      disabled={isSubmitting}
                      autoFocus
                      autoComplete="username"
                      error={fieldErrors.username}
                    />
                  )}

                  <AuthInput
                    id="password"
                    type={showPassword ? "text" : "password"}
                    icon={<Lock className="h-4 w-4" />}
                    label={t("auth.password")}
                    placeholder={t("auth.passwordPlaceholder")}
                    value={form.password}
                    onChange={updateField("password")}
                    disabled={isSubmitting}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    showToggle={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                    error={fieldErrors.password}
                  />

                  {mode === "register" && (
                    <AuthInput
                      id="passwordConfirm"
                      type={showPassword ? "text" : "password"}
                      icon={<Lock className="h-4 w-4" />}
                      label={t("auth.confirmPassword")}
                      placeholder={t("auth.passwordPlaceholder")}
                      value={form.passwordConfirm}
                      onChange={updateField("passwordConfirm")}
                      disabled={isSubmitting}
                      autoComplete="new-password"
                      error={fieldErrors.passwordConfirm}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-lg border border-red-500/15 bg-red-500/5 px-4 py-3 text-sm text-red-400/80">
                    {isParsedApiError(error) ? error.message : error}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="group relative h-12 w-full overflow-hidden rounded-xl border-0 bg-white text-sm font-medium text-black transition-all duration-200 hover:bg-white/90 hover:shadow-lg hover:shadow-white/5 active:scale-[0.98] disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isAdminSetup ? t("auth.adminSetupSubmitting") : mode === "login" ? t("auth.signingIn") : t("auth.creatingAccount")}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {isAdminSetup ? t("auth.adminSetupSubmit") : mode === "login" ? t("auth.signIn") : t("auth.signUp")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              )}
            </Button>
          </form>

          {/* Toggle mode */}
          {!isAdminSetup && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={toggleMode}
                className="text-sm text-white/30 transition-colors hover:text-white/60"
              >
                {mode === "login" ? (
                  <>
                    {t("auth.noAccount")}{" "}
                    <span className="font-medium text-white/70 underline underline-offset-4">{t("auth.signUp")}</span>
                  </>
                ) : (
                  <>
                    {t("auth.hasAccount")}{" "}
                    <span className="font-medium text-white/70 underline underline-offset-4">{t("auth.signIn")}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-white/15">
          {t("auth.footerSecure")}
        </p>
      </motion.div>
    </div>
  );
};

export default LoginPage;