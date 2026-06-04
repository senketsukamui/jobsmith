import { createTRPCReact } from '@trpc/react-query'
import type { AppRouter } from '../../electron/ipc/router'

export const trpc = createTRPCReact<AppRouter>()
