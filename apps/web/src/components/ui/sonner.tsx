import type { ComponentProps } from "react";
import { Toaster as SonnerToaster, toast } from "sonner";

type ToasterProps = ComponentProps<typeof SonnerToaster>;

function Toaster({ closeButton = true, position = "top-center", richColors = true, ...props }: ToasterProps) {
  return (
    <SonnerToaster
      closeButton={closeButton}
      position={position}
      richColors={richColors}
      {...props}
    />
  );
}

export { Toaster, toast };
