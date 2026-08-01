import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} duration={2000} {...props}>
            {title && <ToastTitle>{title}</ToastTitle>}
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
