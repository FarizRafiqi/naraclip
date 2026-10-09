import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'api_new_account.store': { paramsTuple?: []; params?: {} }
    'access_tokens.store': { paramsTuple?: []; params?: {} }
    'profile.show': { paramsTuple?: []; params?: {} }
    'access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'projects.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'jobs.store': { paramsTuple: [ParamValue]; params: {'videoId': ParamValue} }
    'jobs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  GET: {
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'profile.show': { paramsTuple?: []; params?: {} }
    'projects.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'jobs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  HEAD: {
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'profile.show': { paramsTuple?: []; params?: {} }
    'projects.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'jobs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  POST: {
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'api_new_account.store': { paramsTuple?: []; params?: {} }
    'access_tokens.store': { paramsTuple?: []; params?: {} }
    'access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'jobs.store': { paramsTuple: [ParamValue]; params: {'videoId': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}