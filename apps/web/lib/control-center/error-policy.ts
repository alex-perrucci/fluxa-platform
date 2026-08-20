export type ControlCenterErrorCategory =
  | 'SESSION_REQUIRED'
  | 'ORGANIZATION_REQUIRED'
  | 'LOCATION_REQUIRED'
  | 'DEVICE_NOT_ASSIGNED'
  | 'DEVICE_WRONG_LOCATION'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFIGURATION_INCOMPLETE'
  | 'SERVER_ERROR';

export interface ControlCenterErrorView {
  category: ControlCenterErrorCategory;
  message: string;
}

export function controlCenterErrorView(
  code: string,
  status: number,
): ControlCenterErrorView {
  if (code === 'SESSION_REQUIRED' || status === 401) {
    return {
      category: 'SESSION_REQUIRED',
      message: 'La sessione è scaduta. Accedi di nuovo per continuare.',
    };
  }

  if (
    code === 'ORGANIZATION_REQUIRED' ||
    code === 'TENANT_CONTEXT_REQUIRED' ||
    code === 'ORGANIZATION_CONTEXT_REQUIRED'
  ) {
    return {
      category: 'ORGANIZATION_REQUIRED',
      message: 'Seleziona un’organizzazione per continuare.',
    };
  }

  if (
    code === 'DEVICE_NOT_ASSIGNED' ||
    code === 'DEVICE_ASSIGNMENT_NOT_FOUND'
  ) {
    return {
      category: 'DEVICE_NOT_ASSIGNED',
      message: 'Questo dispositivo non è ancora assegnato a una sede.',
    };
  }

  if (code === 'DEVICE_LOCATION_ACCESS_DENIED') {
    return {
      category: 'DEVICE_WRONG_LOCATION',
      message: 'Questo dispositivo è assegnato a un’altra sede.',
    };
  }

  if (
    code === 'LOCATION_REQUIRED' ||
    code === 'LOCATION_INACTIVE' ||
    code === 'LOCATION_NOT_FOUND'
  ) {
    return {
      category: 'LOCATION_REQUIRED',
      message: 'Seleziona una sede attiva per continuare.',
    };
  }

  if (
    code === 'INSUFFICIENT_ROLE' ||
    code === 'LOCATION_ACCESS_DENIED' ||
    code === 'LOCATION_PERMISSION_DENIED' ||
    code === 'PLATFORM_ADMIN_REQUIRED' ||
    status === 403
  ) {
    return {
      category: 'FORBIDDEN',
      message: 'Non hai i permessi necessari per questa operazione.',
    };
  }

  if (
    code === 'CONFIGURATION_INCOMPLETE' ||
    code.endsWith('_NOT_CONFIGURED') ||
    code.endsWith('_CREDENTIALS_MISSING')
  ) {
    return {
      category: 'CONFIGURATION_INCOMPLETE',
      message: 'La configurazione non è ancora completa. Contatta l’assistenza Fluxa.',
    };
  }

  if (status === 404 || code.endsWith('_NOT_FOUND')) {
    return {
      category: 'NOT_FOUND',
      message: 'La risorsa richiesta non è disponibile.',
    };
  }

  return {
    category: 'SERVER_ERROR',
    message: 'Non è stato possibile completare l’operazione. Riprova tra poco.',
  };
}
