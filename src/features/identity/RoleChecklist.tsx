import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { Role } from '@/types/identity';
import { CEO_ROLE_NAME, roleLockReason } from './shared';

interface RoleChecklistProps {
  roles: Role[];
  value: string[];
  onChange: (roleIds: string[]) => void;
  error?: string;
}

/**
 * Chọn vai trò cho nhân viên. Không có CEO (docs/21 I5). Vai trò có quyền người đang
 * đăng nhập không có hiện mờ và không đổi được (giữ nguyên nếu nhân viên đang mang).
 */
export function RoleChecklist({ roles, value, onChange, error }: RoleChecklistProps) {
  const { companyContext } = useAuth();
  const visible = roles.filter((r) => !(r.builtIn && r.name === CEO_ROLE_NAME));

  return (
    <div className="grid gap-1" role="group" aria-label="Vai trò" data-testid="role-checklist">
      {visible.map((role) => {
        const lock = roleLockReason(role, companyContext);
        const id = `role-${role.id}`;
        return (
          <label
            key={role.id}
            htmlFor={id}
            className={cn(
              'flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50',
              lock ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            )}
          >
            <Checkbox
              id={id}
              className="mt-0.5"
              disabled={Boolean(lock)}
              checked={value.includes(role.id)}
              onCheckedChange={(checked) =>
                onChange(checked ? [...value, role.id] : value.filter((v) => v !== role.id))
              }
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">
                {role.name}
                {role.builtIn && <span className="font-normal text-muted-foreground"> · có sẵn</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                {lock ?? `${role.permissions.length} quyền`}
              </span>
            </span>
          </label>
        );
      })}
      {error && (
        <p className="text-sm text-destructive" data-testid="roleIds-error">
          {error}
        </p>
      )}
    </div>
  );
}
