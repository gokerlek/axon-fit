'use client';

import { useState } from 'react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

/**
 * Telefonda şifre kutusu: büyük (48 px), "Göster" düğmesi 44 px dokunma alanıyla. Parola
 * yöneticisi ve klavye doğru öneriyi versin diye `autoComplete` zorunlu: girişte
 * `current-password`, belirlemede `new-password`. Formisch'in alan özellikleri olduğu gibi yayılır.
 */
export function PasswordInput({
  autoComplete,
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type' | 'autoComplete'> & {
  autoComplete: 'current-password' | 'new-password';
}) {
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup className={cn('h-12', className)}>
      <InputGroupInput
        {...props}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="h-full text-base"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          className="h-11 min-w-16 px-3"
          aria-pressed={visible}
          aria-controls={props.id}
          aria-label="Şifreyi göster"
          onClick={() => setVisible((current) => !current)}>
          {visible ? 'Gizle' : 'Göster'}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
