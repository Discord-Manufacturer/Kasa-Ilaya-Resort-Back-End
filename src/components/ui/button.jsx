import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { buttonVariants } from '@/components/ui/button-variants';

export const Button = React.forwardRef(({ className, variant = 'default', size = 'default', asChild = false, type, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      className={buttonVariants({ variant, size, className })}
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      {...props}
    />
  );
});

Button.displayName = 'Button';