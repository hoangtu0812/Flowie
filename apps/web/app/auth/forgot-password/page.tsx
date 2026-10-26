import { PasswordRecovery } from '@/features/identity/password-recovery';
import { PasswordAuthBoundary } from '@/features/identity/auth-providers';
export default function ForgotPasswordPage() {
   return (
      <PasswordAuthBoundary>
         <PasswordRecovery />
      </PasswordAuthBoundary>
   );
}
