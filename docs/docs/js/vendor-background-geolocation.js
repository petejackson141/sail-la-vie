var TSBackgroundGeolocationModule = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/AuthorizationStatus.js
  var require_AuthorizationStatus = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/AuthorizationStatus.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.AuthorizationStatus = void 0;
      exports.AuthorizationStatus = {
        NotDetermined: 0,
        Restricted: 1,
        Denied: 2,
        Always: 3,
        WhenInUse: 4,
        DeniedAlways: 5
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/Permission.js
  var require_Permission = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/Permission.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.Permission = void 0;
      exports.Permission = {
        Location: "location",
        Motion: "motion"
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/LogLevel.js
  var require_LogLevel = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/LogLevel.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.LogLevel = void 0;
      exports.LogLevel = {
        Off: 0,
        Error: 1,
        Warning: 2,
        Info: 3,
        Debug: 4,
        Verbose: 5
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/DesiredAccuracy.js
  var require_DesiredAccuracy = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/DesiredAccuracy.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.DesiredAccuracy = void 0;
      exports.DesiredAccuracy = {
        Navigation: -2,
        High: -1,
        Medium: 10,
        Low: 100,
        VeryLow: 1e3,
        Lowest: 3e3
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/PersistMode.js
  var require_PersistMode = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/PersistMode.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.PersistMode = void 0;
      exports.PersistMode = {
        All: 2,
        Location: 1,
        Geofence: -1,
        None: 0
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/AuthorizationStrategy.js
  var require_AuthorizationStrategy = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/AuthorizationStrategy.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.AuthorizationStrategy = void 0;
      exports.AuthorizationStrategy = {
        Jwt: "jwt",
        Sas: "sas"
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/LocationRequest.js
  var require_LocationRequest = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/LocationRequest.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.LocationRequest = void 0;
      exports.LocationRequest = {
        Always: "Always",
        WhenInUse: "WhenInUse",
        Any: "Any"
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/LocationFilterPolicy.js
  var require_LocationFilterPolicy = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/LocationFilterPolicy.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.LocationFilterPolicy = void 0;
      exports.LocationFilterPolicy = {
        PassThrough: 0,
        Adjust: 1,
        Conservative: 2
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/KalmanProfile.js
  var require_KalmanProfile = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/KalmanProfile.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.KalmanProfile = void 0;
      exports.KalmanProfile = {
        Default: 0,
        Aggressive: 1,
        Conservative: 2
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/HttpMethod.js
  var require_HttpMethod = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/HttpMethod.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.HttpMethod = void 0;
      exports.HttpMethod = {
        Post: "POST",
        Put: "PUT",
        Patch: "PATCH"
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/TriggerActivity.js
  var require_TriggerActivity = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/TriggerActivity.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.TriggerActivity = void 0;
      exports.TriggerActivity = {
        Walking: "walking",
        OnFoot: "on_foot",
        Running: "running",
        OnBicycle: "on_bicycle",
        InVehicle: "in_vehicle"
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/NotificationPriority.js
  var require_NotificationPriority = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/NotificationPriority.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.NotificationPriority = void 0;
      exports.NotificationPriority = {
        Default: 0,
        High: 1,
        Low: -1,
        Max: 2,
        Min: -2
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/MotionActivityType.js
  var require_MotionActivityType = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/MotionActivityType.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.MotionActivityType = void 0;
      exports.MotionActivityType = {
        Still: "still",
        Walking: "walking",
        OnFoot: "on_foot",
        Running: "running",
        OnBicycle: "on_bicycle",
        InVehicle: "in_vehicle",
        Unknown: "unknown"
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/TrackingMode.js
  var require_TrackingMode = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/TrackingMode.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.TrackingMode = void 0;
      exports.TrackingMode = {
        Geofences: 0,
        Location: 1
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/AccuracyAuthorization.js
  var require_AccuracyAuthorization = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/AccuracyAuthorization.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.AccuracyAuthorization = void 0;
      exports.AccuracyAuthorization = {
        Full: 0,
        Reduced: 1
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/LogLevelName.js
  var require_LogLevelName = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/LogLevelName.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.LogLevelName = void 0;
      exports.LogLevelName = {
        Debug: "debug",
        Notice: "notice",
        Info: "info",
        Warn: "warn",
        Error: "error"
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/GeofenceAction.js
  var require_GeofenceAction = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/GeofenceAction.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.GeofenceAction = void 0;
      exports.GeofenceAction = {
        Enter: "ENTER",
        Exit: "EXIT",
        Dwell: "DWELL"
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/Event.js
  var require_Event = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/Event.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.Event = void 0;
      exports.Event = {
        Boot: "boot",
        Terminate: "terminate",
        Location: "location",
        MotionChange: "motionchange",
        ActivityChange: "activitychange",
        LocationFilter: "locationfilter",
        Geofence: "geofence",
        GeofencesChange: "geofenceschange",
        Http: "http",
        Heartbeat: "heartbeat",
        ProviderChange: "providerchange",
        Schedule: "schedule",
        Notification: "notification",
        Authorization: "authorization",
        ConnectivityChange: "connectivitychange",
        EnabledChange: "enabledchange",
        PowerSaveChange: "powersavechange"
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/ActivityType.js
  var require_ActivityType = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/ActivityType.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.ActivityType = void 0;
      exports.ActivityType = {
        Other: 1,
        AutomotiveNavigation: 2,
        Fitness: 3,
        OtherNavigation: 4,
        Airborne: 5
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/LocationError.js
  var require_LocationError = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/LocationError.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.LocationError = void 0;
      exports.LocationError = {
        LocationUnknown: 0,
        PermissionDenied: 1,
        NetworkError: 2,
        BackgroundWhenInUse: 3,
        Timeout: 408,
        Cancelled: 499
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/LocationFilterReason.js
  var require_LocationFilterReason = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/LocationFilterReason.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.LocationFilterReason = void 0;
      exports.LocationFilterReason = {
        LowAccuracy: "low-accuracy",
        ImpliedSpeed: "implied-speed",
        OutlierCapped: "outlier-capped",
        GeofenceSpuriousExit: "geofence-spurious-exit",
        GeofenceDuplicateEnter: "geofence-duplicate-enter"
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/enums/SQLQueryOrder.js
  var require_SQLQueryOrder = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/enums/SQLQueryOrder.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.SQLQueryOrder = void 0;
      exports.SQLQueryOrder = {
        Asc: 1,
        Desc: -1
      };
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/data/Location.js
  var require_Location = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/data/Location.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/data/Geofence.js
  var require_Geofence = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/data/Geofence.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/data/DeviceInfo.js
  var require_DeviceInfo = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/data/DeviceInfo.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/data/Sensors.js
  var require_Sensors = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/data/Sensors.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/events/Subscription.js
  var require_Subscription = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/events/Subscription.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/events/GeofenceEvent.js
  var require_GeofenceEvent = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/events/GeofenceEvent.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/events/AuthorizationEvent.js
  var require_AuthorizationEvent = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/events/AuthorizationEvent.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/events/MotionActivityEvent.js
  var require_MotionActivityEvent = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/events/MotionActivityEvent.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/events/HeadlessEvent.js
  var require_HeadlessEvent = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/events/HeadlessEvent.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/events/HeartbeatEvent.js
  var require_HeartbeatEvent = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/events/HeartbeatEvent.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/events/GeofencesChangeEvent.js
  var require_GeofencesChangeEvent = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/events/GeofencesChangeEvent.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/events/ConnectivityChangeEvent.js
  var require_ConnectivityChangeEvent = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/events/ConnectivityChangeEvent.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/events/MotionChangeEvent.js
  var require_MotionChangeEvent = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/events/MotionChangeEvent.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/events/LocationFilterEvent.js
  var require_LocationFilterEvent = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/events/LocationFilterEvent.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/events/ProviderChangeEvent.js
  var require_ProviderChangeEvent = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/events/ProviderChangeEvent.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/events/HttpEvent.js
  var require_HttpEvent = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/events/HttpEvent.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/config/Config.js
  var require_Config = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/config/Config.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/config/GeoConfig.js
  var require_GeoConfig = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/config/GeoConfig.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/config/HttpConfig.js
  var require_HttpConfig = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/config/HttpConfig.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/config/PersistenceConfig.js
  var require_PersistenceConfig = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/config/PersistenceConfig.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/config/ActivityConfig.js
  var require_ActivityConfig = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/config/ActivityConfig.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/config/AppConfig.js
  var require_AppConfig = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/config/AppConfig.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/config/LoggerConfig.js
  var require_LoggerConfig = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/config/LoggerConfig.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/config/AuthorizationConfig.js
  var require_AuthorizationConfig = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/config/AuthorizationConfig.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/config/NotificationConfig.js
  var require_NotificationConfig = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/config/NotificationConfig.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/config/LocationFilter.js
  var require_LocationFilter = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/config/LocationFilter.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/api/BackgroundGeolocation.js
  var require_BackgroundGeolocation = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/api/BackgroundGeolocation.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/api/State.js
  var require_State = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/api/State.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/api/Logger.js
  var require_Logger = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/api/Logger.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/api/DeviceSettings.js
  var require_DeviceSettings = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/api/DeviceSettings.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/api/CurrentPositionRequest.js
  var require_CurrentPositionRequest = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/api/CurrentPositionRequest.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/api/WatchPositionRequest.js
  var require_WatchPositionRequest = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/api/WatchPositionRequest.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/api/LocationQuery.js
  var require_LocationQuery = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/api/LocationQuery.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/core/api/TransistorAuthorizationService.js
  var require_TransistorAuthorizationService = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/core/api/TransistorAuthorizationService.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
    }
  });

  // node_modules/@transistorsoft/background-geolocation-types/dist/index.js
  var require_dist = __commonJS({
    "node_modules/@transistorsoft/background-geolocation-types/dist/index.js"(exports) {
      "use strict";
      var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = { enumerable: true, get: function() {
            return m[k];
          } };
        }
        Object.defineProperty(o, k2, desc);
      }) : (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        o[k2] = m[k];
      }));
      var __exportStar = exports && exports.__exportStar || function(m, exports2) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      __exportStar(require_AuthorizationStatus(), exports);
      __exportStar(require_Permission(), exports);
      __exportStar(require_LogLevel(), exports);
      __exportStar(require_DesiredAccuracy(), exports);
      __exportStar(require_PersistMode(), exports);
      __exportStar(require_AuthorizationStrategy(), exports);
      __exportStar(require_LocationRequest(), exports);
      __exportStar(require_LocationFilterPolicy(), exports);
      __exportStar(require_KalmanProfile(), exports);
      __exportStar(require_HttpMethod(), exports);
      __exportStar(require_TriggerActivity(), exports);
      __exportStar(require_NotificationPriority(), exports);
      __exportStar(require_MotionActivityType(), exports);
      __exportStar(require_TrackingMode(), exports);
      __exportStar(require_AccuracyAuthorization(), exports);
      __exportStar(require_LogLevelName(), exports);
      __exportStar(require_GeofenceAction(), exports);
      __exportStar(require_Event(), exports);
      __exportStar(require_ActivityType(), exports);
      __exportStar(require_LocationError(), exports);
      __exportStar(require_LocationFilterReason(), exports);
      __exportStar(require_SQLQueryOrder(), exports);
      __exportStar(require_Location(), exports);
      __exportStar(require_Geofence(), exports);
      __exportStar(require_DeviceInfo(), exports);
      __exportStar(require_Sensors(), exports);
      __exportStar(require_Subscription(), exports);
      __exportStar(require_GeofenceEvent(), exports);
      __exportStar(require_AuthorizationEvent(), exports);
      __exportStar(require_MotionActivityEvent(), exports);
      __exportStar(require_HeadlessEvent(), exports);
      __exportStar(require_HeartbeatEvent(), exports);
      __exportStar(require_GeofencesChangeEvent(), exports);
      __exportStar(require_ConnectivityChangeEvent(), exports);
      __exportStar(require_MotionChangeEvent(), exports);
      __exportStar(require_LocationFilterEvent(), exports);
      __exportStar(require_ProviderChangeEvent(), exports);
      __exportStar(require_HttpEvent(), exports);
      __exportStar(require_Config(), exports);
      __exportStar(require_GeoConfig(), exports);
      __exportStar(require_HttpConfig(), exports);
      __exportStar(require_PersistenceConfig(), exports);
      __exportStar(require_ActivityConfig(), exports);
      __exportStar(require_AppConfig(), exports);
      __exportStar(require_LoggerConfig(), exports);
      __exportStar(require_AuthorizationConfig(), exports);
      __exportStar(require_NotificationConfig(), exports);
      __exportStar(require_LocationFilter(), exports);
      __exportStar(require_BackgroundGeolocation(), exports);
      __exportStar(require_State(), exports);
      __exportStar(require_Logger(), exports);
      __exportStar(require_DeviceSettings(), exports);
      __exportStar(require_CurrentPositionRequest(), exports);
      __exportStar(require_WatchPositionRequest(), exports);
      __exportStar(require_LocationQuery(), exports);
      __exportStar(require_TransistorAuthorizationService(), exports);
    }
  });

  // node_modules/@transistorsoft/capacitor-background-geolocation/dist/index.js
  var index_exports = {};
  __export(index_exports, {
    default: () => index_default
  });

  // node_modules/tslib/tslib.es6.mjs
  function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P ? value : new P(function(resolve) {
        resolve(value);
      });
    }
    return new (P || (P = Promise))(function(resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  }
  function __generator(thisArg, body) {
    var _ = { label: 0, sent: function() {
      if (t[0] & 1) throw t[1];
      return t[1];
    }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
      return this;
    }), g;
    function verb(n) {
      return function(v) {
        return step([n, v]);
      };
    }
    function step(op) {
      if (f) throw new TypeError("Generator is already executing.");
      while (g && (g = 0, op[0] && (_ = 0)), _) try {
        if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
        if (y = 0, t) op = [op[0] & 2, t.value];
        switch (op[0]) {
          case 0:
          case 1:
            t = op;
            break;
          case 4:
            _.label++;
            return { value: op[1], done: false };
          case 5:
            _.label++;
            y = op[1];
            op = [0];
            continue;
          case 7:
            op = _.ops.pop();
            _.trys.pop();
            continue;
          default:
            if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
              _ = 0;
              continue;
            }
            if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
              _.label = op[1];
              break;
            }
            if (op[0] === 6 && _.label < t[1]) {
              _.label = t[1];
              t = op;
              break;
            }
            if (t && _.label < t[2]) {
              _.label = t[2];
              _.ops.push(op);
              break;
            }
            if (t[2]) _.ops.pop();
            _.trys.pop();
            continue;
        }
        op = body.call(thisArg, _);
      } catch (e) {
        op = [6, e];
        y = 0;
      } finally {
        f = t = 0;
      }
      if (op[0] & 5) throw op[1];
      return { value: op[0] ? op[1] : void 0, done: true };
    }
  }

  // node_modules/@capacitor/core/dist/index.js
  var ExceptionCode;
  (function(ExceptionCode2) {
    ExceptionCode2["Unimplemented"] = "UNIMPLEMENTED";
    ExceptionCode2["Unavailable"] = "UNAVAILABLE";
  })(ExceptionCode || (ExceptionCode = {}));
  var CapacitorException = class extends Error {
    constructor(message, code, data) {
      super(message);
      this.message = message;
      this.code = code;
      this.data = data;
    }
  };
  var getPlatformId = (win) => {
    var _a, _b;
    if (win === null || win === void 0 ? void 0 : win.androidBridge) {
      return "android";
    } else if ((_b = (_a = win === null || win === void 0 ? void 0 : win.webkit) === null || _a === void 0 ? void 0 : _a.messageHandlers) === null || _b === void 0 ? void 0 : _b.bridge) {
      return "ios";
    } else {
      return "web";
    }
  };
  var createCapacitor = (win) => {
    const capCustomPlatform = win.CapacitorCustomPlatform || null;
    const cap = win.Capacitor || {};
    const Plugins = cap.Plugins = cap.Plugins || {};
    const getPlatform = () => {
      return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
    };
    const isNativePlatform = () => getPlatform() !== "web";
    const isPluginAvailable = (pluginName) => {
      const plugin = registeredPlugins.get(pluginName);
      if (plugin === null || plugin === void 0 ? void 0 : plugin.platforms.has(getPlatform())) {
        return true;
      }
      if (getPluginHeader(pluginName)) {
        return true;
      }
      return false;
    };
    const getPluginHeader = (pluginName) => {
      var _a;
      return (_a = cap.PluginHeaders) === null || _a === void 0 ? void 0 : _a.find((h) => h.name === pluginName);
    };
    const handleError = (err) => win.console.error(err);
    const registeredPlugins = /* @__PURE__ */ new Map();
    const registerPlugin2 = (pluginName, jsImplementations = {}) => {
      const registeredPlugin = registeredPlugins.get(pluginName);
      if (registeredPlugin) {
        console.warn(`Capacitor plugin "${pluginName}" already registered. Cannot register plugins twice.`);
        return registeredPlugin.proxy;
      }
      const platform = getPlatform();
      const pluginHeader = getPluginHeader(pluginName);
      let jsImplementation;
      const loadPluginImplementation = async () => {
        if (!jsImplementation && platform in jsImplementations) {
          jsImplementation = typeof jsImplementations[platform] === "function" ? jsImplementation = await jsImplementations[platform]() : jsImplementation = jsImplementations[platform];
        } else if (capCustomPlatform !== null && !jsImplementation && "web" in jsImplementations) {
          jsImplementation = typeof jsImplementations["web"] === "function" ? jsImplementation = await jsImplementations["web"]() : jsImplementation = jsImplementations["web"];
        }
        return jsImplementation;
      };
      const createPluginMethod = (impl, prop) => {
        var _a, _b;
        if (pluginHeader) {
          const methodHeader = pluginHeader === null || pluginHeader === void 0 ? void 0 : pluginHeader.methods.find((m) => prop === m.name);
          if (methodHeader) {
            if (methodHeader.rtype === "promise") {
              return (options) => cap.nativePromise(pluginName, prop.toString(), options);
            } else {
              return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
            }
          } else if (impl) {
            return (_a = impl[prop]) === null || _a === void 0 ? void 0 : _a.bind(impl);
          }
        } else if (impl) {
          return (_b = impl[prop]) === null || _b === void 0 ? void 0 : _b.bind(impl);
        } else {
          throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, ExceptionCode.Unimplemented);
        }
      };
      const createPluginMethodWrapper = (prop) => {
        let remove;
        const wrapper = (...args) => {
          const p = loadPluginImplementation().then((impl) => {
            const fn = createPluginMethod(impl, prop);
            if (fn) {
              const p2 = fn(...args);
              remove = p2 === null || p2 === void 0 ? void 0 : p2.remove;
              return p2;
            } else {
              throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, ExceptionCode.Unimplemented);
            }
          });
          if (prop === "addListener") {
            p.remove = async () => remove();
          }
          return p;
        };
        wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
        Object.defineProperty(wrapper, "name", {
          value: prop,
          writable: false,
          configurable: false
        });
        return wrapper;
      };
      const addListener = createPluginMethodWrapper("addListener");
      const removeListener = createPluginMethodWrapper("removeListener");
      const addListenerNative = (eventName, callback) => {
        const call = addListener({ eventName }, callback);
        const remove = async () => {
          const callbackId = await call;
          removeListener({
            eventName,
            callbackId
          }, callback);
        };
        const p = new Promise((resolve) => call.then(() => resolve({ remove })));
        p.remove = async () => {
          console.warn(`Using addListener() without 'await' is deprecated.`);
          await remove();
        };
        return p;
      };
      const proxy = new Proxy({}, {
        get(_, prop) {
          switch (prop) {
            // https://github.com/facebook/react/issues/20030
            case "$$typeof":
              return void 0;
            case "toJSON":
              return () => ({});
            case "addListener":
              return pluginHeader ? addListenerNative : addListener;
            case "removeListener":
              return removeListener;
            default:
              return createPluginMethodWrapper(prop);
          }
        }
      });
      Plugins[pluginName] = proxy;
      registeredPlugins.set(pluginName, {
        name: pluginName,
        proxy,
        platforms: /* @__PURE__ */ new Set([...Object.keys(jsImplementations), ...pluginHeader ? [platform] : []])
      });
      return proxy;
    };
    if (!cap.convertFileSrc) {
      cap.convertFileSrc = (filePath) => filePath;
    }
    cap.getPlatform = getPlatform;
    cap.handleError = handleError;
    cap.isNativePlatform = isNativePlatform;
    cap.isPluginAvailable = isPluginAvailable;
    cap.registerPlugin = registerPlugin2;
    cap.Exception = CapacitorException;
    cap.DEBUG = !!cap.DEBUG;
    cap.isLoggingEnabled = !!cap.isLoggingEnabled;
    return cap;
  };
  var initCapacitorGlobal = (win) => win.Capacitor = createCapacitor(win);
  var Capacitor = /* @__PURE__ */ initCapacitorGlobal(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
  var registerPlugin = Capacitor.registerPlugin;
  var WebPlugin = class {
    constructor() {
      this.listeners = {};
      this.retainedEventArguments = {};
      this.windowListeners = {};
    }
    addListener(eventName, listenerFunc) {
      let firstListener = false;
      const listeners = this.listeners[eventName];
      if (!listeners) {
        this.listeners[eventName] = [];
        firstListener = true;
      }
      this.listeners[eventName].push(listenerFunc);
      const windowListener = this.windowListeners[eventName];
      if (windowListener && !windowListener.registered) {
        this.addWindowListener(windowListener);
      }
      if (firstListener) {
        this.sendRetainedArgumentsForEvent(eventName);
      }
      const remove = async () => this.removeListener(eventName, listenerFunc);
      const p = Promise.resolve({ remove });
      return p;
    }
    async removeAllListeners() {
      this.listeners = {};
      for (const listener in this.windowListeners) {
        this.removeWindowListener(this.windowListeners[listener]);
      }
      this.windowListeners = {};
    }
    notifyListeners(eventName, data, retainUntilConsumed) {
      const listeners = this.listeners[eventName];
      if (!listeners) {
        if (retainUntilConsumed) {
          let args = this.retainedEventArguments[eventName];
          if (!args) {
            args = [];
          }
          args.push(data);
          this.retainedEventArguments[eventName] = args;
        }
        return;
      }
      listeners.forEach((listener) => listener(data));
    }
    hasListeners(eventName) {
      var _a;
      return !!((_a = this.listeners[eventName]) === null || _a === void 0 ? void 0 : _a.length);
    }
    registerWindowListener(windowEventName, pluginEventName) {
      this.windowListeners[pluginEventName] = {
        registered: false,
        windowEventName,
        pluginEventName,
        handler: (event) => {
          this.notifyListeners(pluginEventName, event);
        }
      };
    }
    unimplemented(msg = "not implemented") {
      return new Capacitor.Exception(msg, ExceptionCode.Unimplemented);
    }
    unavailable(msg = "not available") {
      return new Capacitor.Exception(msg, ExceptionCode.Unavailable);
    }
    async removeListener(eventName, listenerFunc) {
      const listeners = this.listeners[eventName];
      if (!listeners) {
        return;
      }
      const index = listeners.indexOf(listenerFunc);
      this.listeners[eventName].splice(index, 1);
      if (!this.listeners[eventName].length) {
        this.removeWindowListener(this.windowListeners[eventName]);
      }
    }
    addWindowListener(handle) {
      window.addEventListener(handle.windowEventName, handle.handler);
      handle.registered = true;
    }
    removeWindowListener(handle) {
      if (!handle) {
        return;
      }
      window.removeEventListener(handle.windowEventName, handle.handler);
      handle.registered = false;
    }
    sendRetainedArgumentsForEvent(eventName) {
      const args = this.retainedEventArguments[eventName];
      if (!args) {
        return;
      }
      delete this.retainedEventArguments[eventName];
      args.forEach((arg) => {
        this.notifyListeners(eventName, arg);
      });
    }
  };
  var encode = (str) => encodeURIComponent(str).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape);
  var decode = (str) => str.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent);
  var CapacitorCookiesPluginWeb = class extends WebPlugin {
    async getCookies() {
      const cookies = document.cookie;
      const cookieMap = {};
      cookies.split(";").forEach((cookie) => {
        if (cookie.length <= 0)
          return;
        let [key, value] = cookie.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
        key = decode(key).trim();
        value = decode(value).trim();
        cookieMap[key] = value;
      });
      return cookieMap;
    }
    async setCookie(options) {
      try {
        const encodedKey = encode(options.key);
        const encodedValue = encode(options.value);
        const expires = options.expires ? `; expires=${options.expires.replace("expires=", "")}` : "";
        const path = (options.path || "/").replace("path=", "");
        const domain = options.url != null && options.url.length > 0 ? `domain=${options.url}` : "";
        document.cookie = `${encodedKey}=${encodedValue || ""}${expires}; path=${path}; ${domain};`;
      } catch (error) {
        return Promise.reject(error);
      }
    }
    async deleteCookie(options) {
      try {
        document.cookie = `${options.key}=; Max-Age=0`;
      } catch (error) {
        return Promise.reject(error);
      }
    }
    async clearCookies() {
      try {
        const cookies = document.cookie.split(";") || [];
        for (const cookie of cookies) {
          document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${(/* @__PURE__ */ new Date()).toUTCString()};path=/`);
        }
      } catch (error) {
        return Promise.reject(error);
      }
    }
    async clearAllCookies() {
      try {
        await this.clearCookies();
      } catch (error) {
        return Promise.reject(error);
      }
    }
  };
  var CapacitorCookies = registerPlugin("CapacitorCookies", {
    web: () => new CapacitorCookiesPluginWeb()
  });
  var readBlobAsBase64 = async (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result;
      resolve(base64String.indexOf(",") >= 0 ? base64String.split(",")[1] : base64String);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(blob);
  });
  var normalizeHttpHeaders = (headers = {}) => {
    const originalKeys = Object.keys(headers);
    const loweredKeys = Object.keys(headers).map((k) => k.toLocaleLowerCase());
    const normalized = loweredKeys.reduce((acc, key, index) => {
      acc[key] = headers[originalKeys[index]];
      return acc;
    }, {});
    return normalized;
  };
  var buildUrlParams = (params, shouldEncode = true) => {
    if (!params)
      return null;
    const output = Object.entries(params).reduce((accumulator, entry) => {
      const [key, value] = entry;
      let encodedValue;
      let item;
      if (Array.isArray(value)) {
        item = "";
        value.forEach((str) => {
          encodedValue = shouldEncode ? encodeURIComponent(str) : str;
          item += `${key}=${encodedValue}&`;
        });
        item.slice(0, -1);
      } else {
        encodedValue = shouldEncode ? encodeURIComponent(value) : value;
        item = `${key}=${encodedValue}`;
      }
      return `${accumulator}&${item}`;
    }, "");
    return output.substr(1);
  };
  var buildRequestInit = (options, extra = {}) => {
    const output = Object.assign({ method: options.method || "GET", headers: options.headers }, extra);
    const headers = normalizeHttpHeaders(options.headers);
    const type = headers["content-type"] || "";
    if (typeof options.data === "string") {
      output.body = options.data;
    } else if (type.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.data || {})) {
        params.set(key, value);
      }
      output.body = params.toString();
    } else if (type.includes("multipart/form-data") || options.data instanceof FormData) {
      const form = new FormData();
      if (options.data instanceof FormData) {
        options.data.forEach((value, key) => {
          form.append(key, value);
        });
      } else {
        for (const key of Object.keys(options.data)) {
          form.append(key, options.data[key]);
        }
      }
      output.body = form;
      const headers2 = new Headers(output.headers);
      headers2.delete("content-type");
      output.headers = headers2;
    } else if (type.includes("application/json") || typeof options.data === "object") {
      output.body = JSON.stringify(options.data);
    }
    return output;
  };
  var CapacitorHttpPluginWeb = class extends WebPlugin {
    /**
     * Perform an Http request given a set of options
     * @param options Options to build the HTTP request
     */
    async request(options) {
      const requestInit = buildRequestInit(options, options.webFetchExtra);
      const urlParams = buildUrlParams(options.params, options.shouldEncodeUrlParams);
      const url = urlParams ? `${options.url}?${urlParams}` : options.url;
      const response = await fetch(url, requestInit);
      const contentType = response.headers.get("content-type") || "";
      let { responseType = "text" } = response.ok ? options : {};
      if (contentType.includes("application/json")) {
        responseType = "json";
      }
      let data;
      let blob;
      switch (responseType) {
        case "arraybuffer":
        case "blob":
          blob = await response.blob();
          data = await readBlobAsBase64(blob);
          break;
        case "json":
          data = await response.json();
          break;
        case "document":
        case "text":
        default:
          data = await response.text();
      }
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return {
        data,
        headers,
        status: response.status,
        url: response.url
      };
    }
    /**
     * Perform an Http GET request given a set of options
     * @param options Options to build the HTTP request
     */
    async get(options) {
      return this.request(Object.assign(Object.assign({}, options), { method: "GET" }));
    }
    /**
     * Perform an Http POST request given a set of options
     * @param options Options to build the HTTP request
     */
    async post(options) {
      return this.request(Object.assign(Object.assign({}, options), { method: "POST" }));
    }
    /**
     * Perform an Http PUT request given a set of options
     * @param options Options to build the HTTP request
     */
    async put(options) {
      return this.request(Object.assign(Object.assign({}, options), { method: "PUT" }));
    }
    /**
     * Perform an Http PATCH request given a set of options
     * @param options Options to build the HTTP request
     */
    async patch(options) {
      return this.request(Object.assign(Object.assign({}, options), { method: "PATCH" }));
    }
    /**
     * Perform an Http DELETE request given a set of options
     * @param options Options to build the HTTP request
     */
    async delete(options) {
      return this.request(Object.assign(Object.assign({}, options), { method: "DELETE" }));
    }
  };
  var CapacitorHttp = registerPlugin("CapacitorHttp", {
    web: () => new CapacitorHttpPluginWeb()
  });
  var SystemBarsStyle;
  (function(SystemBarsStyle2) {
    SystemBarsStyle2["Dark"] = "DARK";
    SystemBarsStyle2["Light"] = "LIGHT";
    SystemBarsStyle2["Default"] = "DEFAULT";
  })(SystemBarsStyle || (SystemBarsStyle = {}));
  var SystemBarType;
  (function(SystemBarType2) {
    SystemBarType2["StatusBar"] = "StatusBar";
    SystemBarType2["NavigationBar"] = "NavigationBar";
  })(SystemBarType || (SystemBarType = {}));
  var SystemBarsPluginWeb = class extends WebPlugin {
    async setStyle() {
      this.unavailable("not available for web");
    }
    async setAnimation() {
      this.unavailable("not available for web");
    }
    async show() {
      this.unavailable("not available for web");
    }
    async hide() {
      this.unavailable("not available for web");
    }
  };
  var SystemBars = registerPlugin("SystemBars", {
    web: () => new SystemBarsPluginWeb()
  });

  // node_modules/@transistorsoft/capacitor-background-geolocation/dist/index.js
  var import_background_geolocation_types = __toESM(require_dist());
  var NativeModule = registerPlugin("BackgroundGeolocation");
  var LOGGER_LOG_LEVEL_DEBUG = "debug";
  var LOGGER_LOG_LEVEL_NOTICE = "notice";
  var LOGGER_LOG_LEVEL_INFO = "info";
  var LOGGER_LOG_LEVEL_WARN = "warn";
  var LOGGER_LOG_LEVEL_ERROR = "error";
  var ORDER_ASC = 1;
  var ORDER_DESC = -1;
  function log(level, msg) {
    return NativeModule.log({
      level,
      message: msg
    });
  }
  function validateQuery(query) {
    if (typeof query !== "object")
      return {};
    if (query.hasOwnProperty("start") && isNaN(query.start)) {
      throw new Error("Invalid SQLQuery.start.  Expected unix timestamp but received: " + query.start);
    }
    if (query.hasOwnProperty("end") && isNaN(query.end)) {
      throw new Error("Invalid SQLQuery.end.  Expected unix timestamp but received: " + query.end);
    }
    return query;
  }
  var Logger = (
    /** @class */
    (function() {
      function Logger2() {
      }
      Object.defineProperty(Logger2, "ORDER_ASC", {
        get: function() {
          return ORDER_ASC;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(Logger2, "ORDER_DESC", {
        get: function() {
          return ORDER_DESC;
        },
        enumerable: false,
        configurable: true
      });
      Logger2.debug = function(msg) {
        return log(LOGGER_LOG_LEVEL_DEBUG, msg);
      };
      Logger2.error = function(msg) {
        return log(LOGGER_LOG_LEVEL_ERROR, msg);
      };
      Logger2.warn = function(msg) {
        return log(LOGGER_LOG_LEVEL_WARN, msg);
      };
      Logger2.info = function(msg) {
        return log(LOGGER_LOG_LEVEL_INFO, msg);
      };
      Logger2.notice = function(msg) {
        return log(LOGGER_LOG_LEVEL_NOTICE, msg);
      };
      Logger2.getLog = function(query) {
        query = validateQuery(query);
        return new Promise(function(resolve, reject) {
          NativeModule.getLog({ options: query }).then(function(result) {
            resolve(result.log);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      Logger2.destroyLog = function() {
        return new Promise(function(resolve, reject) {
          NativeModule.destroyLog().then(function() {
            resolve();
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      Logger2.emailLog = function(email, query) {
        query = validateQuery(query);
        return new Promise(function(resolve, reject) {
          NativeModule.emailLog({ email, query }).then(function(result) {
            resolve(result);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      Logger2.uploadLog = function(url, query) {
        query = validateQuery(query);
        return new Promise(function(resolve, reject) {
          NativeModule.uploadLog({ url, query }).then(function() {
            resolve();
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      return Logger2;
    })()
  );
  var DEFAULT_URL = "http://tracker.transistorsoft.com";
  var DUMMY_TOKEN = "DUMMY_TOKEN";
  var REFRESH_PAYLOAD = {
    refresh_token: "{refreshToken}"
  };
  var LOCATIONS_PATH = "/api/locations";
  var REFRESH_TOKEN_PATH = "/api/refresh_token";
  var TransistorAuthorizationToken = (
    /** @class */
    (function() {
      function TransistorAuthorizationToken2() {
      }
      TransistorAuthorizationToken2.findOrCreate = function(orgname, username, url) {
        if (url === void 0) {
          url = DEFAULT_URL;
        }
        return new Promise(function(resolve, reject) {
          NativeModule.getTransistorToken({
            org: orgname,
            username,
            url
          }).then(function(result) {
            if (result.success) {
              var token = result.token;
              token.url = url;
              resolve(token);
            } else {
              console.warn("[TransistorAuthorizationToken findOrCreate] ERROR: ", result);
              if (result.status == "403") {
                reject(result);
                return;
              }
              resolve({
                accessToken: DUMMY_TOKEN,
                refreshToken: DUMMY_TOKEN,
                expires: -1,
                url
              });
            }
          }).catch(function(error) {
            reject(error);
          });
        });
      };
      TransistorAuthorizationToken2.destroy = function(url) {
        if (url === void 0) {
          url = DEFAULT_URL;
        }
        return new Promise(function(resolve, reject) {
          NativeModule.destroyTransistorToken({ url }).then(function() {
            resolve();
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      TransistorAuthorizationToken2.applyIf = function(config) {
        if (!config.transistorAuthorizationToken)
          return config;
        var token = config.transistorAuthorizationToken;
        delete config.transistorAuthorizationToken;
        if (!config.http) {
          config.http = {};
        }
        config.http.url = token.url + LOCATIONS_PATH;
        config.authorization = {
          strategy: "JWT",
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          refreshUrl: token.url + REFRESH_TOKEN_PATH,
          refreshPayload: REFRESH_PAYLOAD,
          expires: token.expires
        };
        return config;
      };
      return TransistorAuthorizationToken2;
    })()
  );
  var IGNORE_BATTERY_OPTIMIZATIONS = "IGNORE_BATTERY_OPTIMIZATIONS";
  var POWER_MANAGER = "POWER_MANAGER";
  var resolveSettingsRequest = function(resolve, request) {
    var lastSeenAt = request.lastSeenAt;
    if (lastSeenAt > 0) {
      request.lastSeenAt = new Date(lastSeenAt);
    }
    resolve(request);
  };
  var DeviceSettings = (
    /** @class */
    (function() {
      function DeviceSettings2() {
      }
      DeviceSettings2.isIgnoringBatteryOptimizations = function() {
        return new Promise(function(resolve, reject) {
          NativeModule.isIgnoringBatteryOptimizations().then(function(result) {
            resolve(result.isIgnoringBatteryOptimizations);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      DeviceSettings2.showIgnoreBatteryOptimizations = function() {
        return new Promise(function(resolve, reject) {
          var args = { action: IGNORE_BATTERY_OPTIMIZATIONS };
          NativeModule.requestSettings(args).then(function(result) {
            resolveSettingsRequest(resolve, result);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      DeviceSettings2.showPowerManager = function() {
        return new Promise(function(resolve, reject) {
          var args = { action: POWER_MANAGER };
          NativeModule.requestSettings(args).then(function(result) {
            resolveSettingsRequest(resolve, result);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      DeviceSettings2.show = function(request) {
        return new Promise(function(resolve, reject) {
          var args = { action: request.action };
          NativeModule.showSettings(args).then(function() {
            resolve();
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      return DeviceSettings2;
    })()
  );
  var TAG = "TSLocationManager";
  var EVENT_SUBSCRIPTIONS = [];
  var WATCH_POSITION_SUBSCRIPTIONS = /* @__PURE__ */ new Map();
  var Subscription = (
    /** @class */
    /* @__PURE__ */ (function() {
      function Subscription2(event, subscription, callback) {
        this.event = event;
        this.subscription = subscription;
        this.callback = callback;
      }
      return Subscription2;
    })()
  );
  var LOG_LEVEL_OFF = import_background_geolocation_types.LogLevel.Off;
  var LOG_LEVEL_ERROR = import_background_geolocation_types.LogLevel.Error;
  var LOG_LEVEL_WARNING = import_background_geolocation_types.LogLevel.Warning;
  var LOG_LEVEL_INFO = import_background_geolocation_types.LogLevel.Info;
  var LOG_LEVEL_DEBUG = import_background_geolocation_types.LogLevel.Debug;
  var LOG_LEVEL_VERBOSE = import_background_geolocation_types.LogLevel.Verbose;
  var DESIRED_ACCURACY_NAVIGATION = import_background_geolocation_types.DesiredAccuracy.Navigation;
  var DESIRED_ACCURACY_HIGH = import_background_geolocation_types.DesiredAccuracy.High;
  var DESIRED_ACCURACY_MEDIUM = import_background_geolocation_types.DesiredAccuracy.Medium;
  var DESIRED_ACCURACY_LOW = import_background_geolocation_types.DesiredAccuracy.Low;
  var DESIRED_ACCURACY_VERY_LOW = import_background_geolocation_types.DesiredAccuracy.VeryLow;
  var DESIRED_ACCURACY_LOWEST = import_background_geolocation_types.DesiredAccuracy.Lowest;
  var AUTHORIZATION_STATUS_NOT_DETERMINED = import_background_geolocation_types.AuthorizationStatus.NotDetermined;
  var AUTHORIZATION_STATUS_RESTRICTED = import_background_geolocation_types.AuthorizationStatus.Restricted;
  var AUTHORIZATION_STATUS_DENIED = import_background_geolocation_types.AuthorizationStatus.Denied;
  var AUTHORIZATION_STATUS_ALWAYS = import_background_geolocation_types.AuthorizationStatus.Always;
  var AUTHORIZATION_STATUS_WHEN_IN_USE = import_background_geolocation_types.AuthorizationStatus.WhenInUse;
  var NOTIFICATION_PRIORITY_DEFAULT = import_background_geolocation_types.NotificationPriority.Default;
  var NOTIFICATION_PRIORITY_HIGH = import_background_geolocation_types.NotificationPriority.High;
  var NOTIFICATION_PRIORITY_LOW = import_background_geolocation_types.NotificationPriority.Low;
  var NOTIFICATION_PRIORITY_MAX = import_background_geolocation_types.NotificationPriority.Max;
  var NOTIFICATION_PRIORITY_MIN = import_background_geolocation_types.NotificationPriority.Min;
  var ACTIVITY_TYPE_OTHER = import_background_geolocation_types.ActivityType.Other;
  var ACTIVITY_TYPE_AUTOMOTIVE_NAVIGATION = import_background_geolocation_types.ActivityType.AutomotiveNavigation;
  var ACTIVITY_TYPE_FITNESS = import_background_geolocation_types.ActivityType.Fitness;
  var ACTIVITY_TYPE_OTHER_NAVIGATION = import_background_geolocation_types.ActivityType.OtherNavigation;
  var ACTIVITY_TYPE_AIRBORNE = import_background_geolocation_types.ActivityType.Airborne;
  var LOCATION_AUTHORIZATION_ALWAYS = import_background_geolocation_types.LocationRequest.Always;
  var LOCATION_AUTHORIZATION_WHEN_IN_USE = import_background_geolocation_types.LocationRequest.WhenInUse;
  var LOCATION_AUTHORIZATION_ANY = import_background_geolocation_types.LocationRequest.Any;
  var PERSIST_MODE_ALL = import_background_geolocation_types.PersistMode.All;
  var PERSIST_MODE_LOCATION = import_background_geolocation_types.PersistMode.Location;
  var PERSIST_MODE_GEOFENCE = import_background_geolocation_types.PersistMode.Geofence;
  var PERSIST_MODE_NONE = import_background_geolocation_types.PersistMode.None;
  var ACCURACY_AUTHORIZATION_FULL = import_background_geolocation_types.AccuracyAuthorization.Full;
  var ACCURACY_AUTHORIZATION_REDUCED = import_background_geolocation_types.AccuracyAuthorization.Reduced;
  var BackgroundGeolocation = (
    /** @class */
    (function() {
      function BackgroundGeolocation2() {
      }
      Object.defineProperty(BackgroundGeolocation2, "LogLevel", {
        get: function() {
          return import_background_geolocation_types.LogLevel;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "DesiredAccuracy", {
        get: function() {
          return import_background_geolocation_types.DesiredAccuracy;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "PersistMode", {
        get: function() {
          return import_background_geolocation_types.PersistMode;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "AuthorizationStatus", {
        get: function() {
          return import_background_geolocation_types.AuthorizationStatus;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "AccuracyAuthorization", {
        get: function() {
          return import_background_geolocation_types.AccuracyAuthorization;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "AuthorizationStrategy", {
        get: function() {
          return import_background_geolocation_types.AuthorizationStrategy;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "LocationFilterPolicy", {
        get: function() {
          return import_background_geolocation_types.LocationFilterPolicy;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "KalmanProfile", {
        get: function() {
          return import_background_geolocation_types.KalmanProfile;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "HttpMethod", {
        get: function() {
          return import_background_geolocation_types.HttpMethod;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "TriggerActivity", {
        get: function() {
          return import_background_geolocation_types.TriggerActivity;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_BOOT", {
        /// Events
        get: function() {
          return import_background_geolocation_types.Event.Boot;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_TERMINATE", {
        get: function() {
          return import_background_geolocation_types.Event.Terminate;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_LOCATION", {
        get: function() {
          return import_background_geolocation_types.Event.Location;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_MOTIONCHANGE", {
        get: function() {
          return import_background_geolocation_types.Event.MotionChange;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_HTTP", {
        get: function() {
          return import_background_geolocation_types.Event.Http;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_HEARTBEAT", {
        get: function() {
          return import_background_geolocation_types.Event.Heartbeat;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_PROVIDERCHANGE", {
        get: function() {
          return import_background_geolocation_types.Event.ProviderChange;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_ACTIVITYCHANGE", {
        get: function() {
          return import_background_geolocation_types.Event.ActivityChange;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_LOCATIONFILTER", {
        get: function() {
          return import_background_geolocation_types.Event.LocationFilter;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_GEOFENCE", {
        get: function() {
          return import_background_geolocation_types.Event.Geofence;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_GEOFENCESCHANGE", {
        get: function() {
          return import_background_geolocation_types.Event.GeofencesChange;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_ENABLEDCHANGE", {
        get: function() {
          return import_background_geolocation_types.Event.EnabledChange;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_CONNECTIVITYCHANGE", {
        get: function() {
          return import_background_geolocation_types.Event.ConnectivityChange;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_SCHEDULE", {
        get: function() {
          return import_background_geolocation_types.Event.Schedule;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_POWERSAVECHANGE", {
        get: function() {
          return import_background_geolocation_types.Event.PowerSaveChange;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_NOTIFICATIONACTION", {
        get: function() {
          return "notificationaction";
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "EVENT_AUTHORIZATION", {
        get: function() {
          return import_background_geolocation_types.Event.Authorization;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "LOG_LEVEL_OFF", {
        get: function() {
          return LOG_LEVEL_OFF;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "LOG_LEVEL_ERROR", {
        get: function() {
          return LOG_LEVEL_ERROR;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "LOG_LEVEL_WARNING", {
        get: function() {
          return LOG_LEVEL_WARNING;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "LOG_LEVEL_INFO", {
        get: function() {
          return LOG_LEVEL_INFO;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "LOG_LEVEL_DEBUG", {
        get: function() {
          return LOG_LEVEL_DEBUG;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "LOG_LEVEL_VERBOSE", {
        get: function() {
          return LOG_LEVEL_VERBOSE;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "ACTIVITY_TYPE_OTHER", {
        get: function() {
          return ACTIVITY_TYPE_OTHER;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "ACTIVITY_TYPE_AUTOMOTIVE_NAVIGATION", {
        get: function() {
          return ACTIVITY_TYPE_AUTOMOTIVE_NAVIGATION;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "ACTIVITY_TYPE_FITNESS", {
        get: function() {
          return ACTIVITY_TYPE_FITNESS;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "ACTIVITY_TYPE_OTHER_NAVIGATION", {
        get: function() {
          return ACTIVITY_TYPE_OTHER_NAVIGATION;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "ACTIVITY_TYPE_AIRBORNE", {
        get: function() {
          return ACTIVITY_TYPE_AIRBORNE;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "DESIRED_ACCURACY_NAVIGATION", {
        get: function() {
          return DESIRED_ACCURACY_NAVIGATION;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "DESIRED_ACCURACY_HIGH", {
        get: function() {
          return DESIRED_ACCURACY_HIGH;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "DESIRED_ACCURACY_MEDIUM", {
        get: function() {
          return DESIRED_ACCURACY_MEDIUM;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "DESIRED_ACCURACY_LOW", {
        get: function() {
          return DESIRED_ACCURACY_LOW;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "DESIRED_ACCURACY_VERY_LOW", {
        get: function() {
          return DESIRED_ACCURACY_VERY_LOW;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "DESIRED_ACCURACY_LOWEST", {
        get: function() {
          return DESIRED_ACCURACY_LOWEST;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "AUTHORIZATION_STATUS_NOT_DETERMINED", {
        get: function() {
          return AUTHORIZATION_STATUS_NOT_DETERMINED;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "AUTHORIZATION_STATUS_RESTRICTED", {
        get: function() {
          return AUTHORIZATION_STATUS_RESTRICTED;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "AUTHORIZATION_STATUS_DENIED", {
        get: function() {
          return AUTHORIZATION_STATUS_DENIED;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "AUTHORIZATION_STATUS_ALWAYS", {
        get: function() {
          return AUTHORIZATION_STATUS_ALWAYS;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "AUTHORIZATION_STATUS_WHEN_IN_USE", {
        get: function() {
          return AUTHORIZATION_STATUS_WHEN_IN_USE;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "NOTIFICATION_PRIORITY_DEFAULT", {
        get: function() {
          return NOTIFICATION_PRIORITY_DEFAULT;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "NOTIFICATION_PRIORITY_HIGH", {
        get: function() {
          return NOTIFICATION_PRIORITY_HIGH;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "NOTIFICATION_PRIORITY_LOW", {
        get: function() {
          return NOTIFICATION_PRIORITY_LOW;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "NOTIFICATION_PRIORITY_MAX", {
        get: function() {
          return NOTIFICATION_PRIORITY_MAX;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "NOTIFICATION_PRIORITY_MIN", {
        get: function() {
          return NOTIFICATION_PRIORITY_MIN;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "LOCATION_AUTHORIZATION_ALWAYS", {
        get: function() {
          return LOCATION_AUTHORIZATION_ALWAYS;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "LOCATION_AUTHORIZATION_WHEN_IN_USE", {
        get: function() {
          return LOCATION_AUTHORIZATION_WHEN_IN_USE;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "LOCATION_AUTHORIZATION_ANY", {
        get: function() {
          return LOCATION_AUTHORIZATION_ANY;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "PERSIST_MODE_ALL", {
        get: function() {
          return PERSIST_MODE_ALL;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "PERSIST_MODE_LOCATION", {
        get: function() {
          return PERSIST_MODE_LOCATION;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "PERSIST_MODE_GEOFENCE", {
        get: function() {
          return PERSIST_MODE_GEOFENCE;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "PERSIST_MODE_NONE", {
        get: function() {
          return PERSIST_MODE_NONE;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "ACCURACY_AUTHORIZATION_FULL", {
        get: function() {
          return ACCURACY_AUTHORIZATION_FULL;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "ACCURACY_AUTHORIZATION_REDUCED", {
        get: function() {
          return ACCURACY_AUTHORIZATION_REDUCED;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "logger", {
        get: function() {
          return Logger;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(BackgroundGeolocation2, "deviceSettings", {
        get: function() {
          return DeviceSettings;
        },
        enumerable: false,
        configurable: true
      });
      BackgroundGeolocation2.ready = function(config) {
        return NativeModule.ready({ options: config });
      };
      BackgroundGeolocation2.reset = function(config) {
        return NativeModule.reset({ options: config });
      };
      BackgroundGeolocation2.start = function() {
        return NativeModule.start();
      };
      BackgroundGeolocation2.stop = function() {
        return NativeModule.stop();
      };
      BackgroundGeolocation2.startSchedule = function() {
        return NativeModule.startSchedule();
      };
      BackgroundGeolocation2.stopSchedule = function() {
        return NativeModule.stopSchedule();
      };
      BackgroundGeolocation2.startGeofences = function() {
        return NativeModule.startGeofences();
      };
      BackgroundGeolocation2.setConfig = function(config) {
        return NativeModule.setConfig({ options: config });
      };
      BackgroundGeolocation2.getState = function() {
        return NativeModule.getState();
      };
      BackgroundGeolocation2.changePace = function(isMoving) {
        return new Promise(function(resolve, reject) {
          NativeModule.changePace({ isMoving }).then(function() {
            resolve();
          }).catch(function(error) {
            reject(error.errorMessage);
          });
        });
      };
      BackgroundGeolocation2.getCurrentPosition = function(options) {
        options = options || {};
        return new Promise(function(resolve, reject) {
          NativeModule.getCurrentPosition({ options }).then(function(result) {
            resolve(result);
          }).catch(function(error) {
            reject(error.code);
          });
        });
      };
      BackgroundGeolocation2.watchPosition = function(options, onLocation, onError) {
        options = options || {};
        var isRemoved = false;
        var nativeWatchId = null;
        var subscriptionProxy = {
          remove: function() {
            isRemoved = true;
            if (nativeWatchId !== null) {
              var listener = WATCH_POSITION_SUBSCRIPTIONS.get(nativeWatchId);
              if (listener) {
                listener.remove();
                WATCH_POSITION_SUBSCRIPTIONS.delete(nativeWatchId);
              }
              NativeModule.stopWatchPosition({ watchId: nativeWatchId });
              nativeWatchId = null;
            }
          }
        };
        var handler = function(response) {
          if (response.hasOwnProperty("error") && response.error != null) {
            if (typeof onError === "function") {
              onError(response.error.code);
            } else {
              console.warn("[BackgroundGeolocation watchPosition] DEFAULT ERROR HANDLER.  Provide an onError callback to watchPosition to receive this message: ", response.error);
            }
          } else {
            onLocation(response);
          }
        };
        NativeModule.addListener("watchposition", handler).then(function(listener) {
          NativeModule.watchPosition({ options }).then(function(result) {
            nativeWatchId = result.watchId;
            if (isRemoved) {
              listener.remove();
              NativeModule.stopWatchPosition({ watchId: nativeWatchId });
            } else {
              WATCH_POSITION_SUBSCRIPTIONS.set(nativeWatchId, listener);
            }
          }).catch(function() {
            listener.remove();
          });
        });
        return subscriptionProxy;
      };
      BackgroundGeolocation2.stopWatchPosition = function(watchId) {
        if (watchId !== void 0) {
          var listener = WATCH_POSITION_SUBSCRIPTIONS.get(watchId);
          if (listener) {
            listener.remove();
            WATCH_POSITION_SUBSCRIPTIONS.delete(watchId);
          }
          NativeModule.stopWatchPosition({ watchId });
        }
      };
      BackgroundGeolocation2.requestPermission = function() {
        return new Promise(function(resolve, reject) {
          NativeModule.requestPermission().then(function(result) {
            if (result.success) {
              resolve(result.status);
            } else {
              reject(result.status);
            }
          });
        });
      };
      BackgroundGeolocation2.requestTemporaryFullAccuracy = function(purpose) {
        return new Promise(function(resolve, reject) {
          NativeModule.requestTemporaryFullAccuracy({ purpose }).then(function(result) {
            resolve(result.accuracyAuthorization);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.getProviderState = function() {
        return NativeModule.getProviderState();
      };
      BackgroundGeolocation2.getLocations = function(query) {
        return new Promise(function(resolve, reject) {
          NativeModule.getLocations({ options: query }).then(function(result) {
            resolve(result.locations);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.insertLocation = function(params) {
        return new Promise(function(resolve, reject) {
          NativeModule.insertLocation({ options: params }).then(function(result) {
            resolve(result.uuid);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.destroyLocations = function() {
        return new Promise(function(resolve, reject) {
          NativeModule.destroyLocations().then(function() {
            resolve();
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.destroyLocation = function(uuid) {
        return new Promise(function(resolve, reject) {
          NativeModule.destroyLocation({ uuid }).then(function() {
            resolve();
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.getCount = function() {
        return new Promise(function(resolve, reject) {
          NativeModule.getCount().then(function(result) {
            resolve(result.count);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.sync = function() {
        return new Promise(function(resolve, reject) {
          NativeModule.sync().then(function(result) {
            resolve(result.locations);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.addGeofence = function(params) {
        return new Promise(function(resolve, reject) {
          NativeModule.addGeofence({ options: params }).then(function() {
            resolve();
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.addGeofences = function(params) {
        return new Promise(function(resolve, reject) {
          NativeModule.addGeofences({ options: params }).then(function() {
            resolve();
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.getGeofences = function() {
        return new Promise(function(resolve, reject) {
          NativeModule.getGeofences().then(function(result) {
            resolve(result.geofences);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.getGeofence = function(identifier) {
        return new Promise(function(resolve, reject) {
          if (identifier === null) {
            reject("identifier is null");
            return;
          }
          NativeModule.getGeofence({ identifier }).then(function(result) {
            resolve(result);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.geofenceExists = function(identifier) {
        return new Promise(function(resolve, reject) {
          if (identifier === null) {
            reject("identifier is null");
            return;
          }
          NativeModule.geofenceExists({ identifier }).then(function(result) {
            resolve(result.exists);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.removeGeofence = function(identifier) {
        return new Promise(function(resolve, reject) {
          if (identifier === null) {
            reject("identifier is null");
            return;
          }
          NativeModule.removeGeofence({ identifier }).then(function() {
            resolve();
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.removeGeofences = function(identifiers) {
        identifiers = identifiers || [];
        return new Promise(function(resolve, reject) {
          NativeModule.removeGeofences({ identifiers }).then(function() {
            resolve();
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.getOdometer = function() {
        return new Promise(function(resolve, reject) {
          NativeModule.getOdometer().then(function(result) {
            resolve(result.odometer);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.setOdometer = function(value) {
        return new Promise(function(resolve, reject) {
          NativeModule.setOdometer({ "odometer": value }).then(function(result) {
            resolve(result);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.resetOdometer = function() {
        return BackgroundGeolocation2.setOdometer(0);
      };
      BackgroundGeolocation2.startBackgroundTask = function() {
        return new Promise(function(resolve, reject) {
          NativeModule.startBackgroundTask().then(function(result) {
            resolve(result.taskId);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.stopBackgroundTask = function(taskId) {
        return new Promise(function(resolve, reject) {
          NativeModule.stopBackgroundTask({ taskId }).then(function() {
            resolve();
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.finish = function(taskId) {
        return BackgroundGeolocation2.stopBackgroundTask(taskId);
      };
      BackgroundGeolocation2.getDeviceInfo = function() {
        return NativeModule.getDeviceInfo();
      };
      BackgroundGeolocation2.playSound = function(soundId) {
        return NativeModule.playSound({ soundId });
      };
      BackgroundGeolocation2.isPowerSaveMode = function() {
        return new Promise(function(resolve, reject) {
          NativeModule.isPowerSaveMode().then(function(result) {
            resolve(result.isPowerSaveMode);
          }).catch(function(error) {
            reject(error.message);
          });
        });
      };
      BackgroundGeolocation2.getSensors = function() {
        return NativeModule.getSensors();
      };
      BackgroundGeolocation2.findOrCreateTransistorAuthorizationToken = function(orgname, username, url) {
        return TransistorAuthorizationToken.findOrCreate(orgname, username, url);
      };
      BackgroundGeolocation2.destroyTransistorAuthorizationToken = function(url) {
        return TransistorAuthorizationToken.destroy(url);
      };
      BackgroundGeolocation2.onLocation = function(cb, onError) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.Location, cb, onError);
      };
      BackgroundGeolocation2.onMotionChange = function(cb) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.MotionChange, cb);
      };
      BackgroundGeolocation2.onHttp = function(cb) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.Http, cb);
      };
      BackgroundGeolocation2.onHeartbeat = function(cb) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.Heartbeat, cb);
      };
      BackgroundGeolocation2.onProviderChange = function(cb) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.ProviderChange, cb);
      };
      BackgroundGeolocation2.onActivityChange = function(cb) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.ActivityChange, cb);
      };
      BackgroundGeolocation2.onLocationFilter = function(cb) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.LocationFilter, cb);
      };
      BackgroundGeolocation2.onGeofence = function(cb) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.Geofence, cb);
      };
      BackgroundGeolocation2.onGeofencesChange = function(cb) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.GeofencesChange, cb);
      };
      BackgroundGeolocation2.onSchedule = function(cb) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.Schedule, cb);
      };
      BackgroundGeolocation2.onEnabledChange = function(cb) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.EnabledChange, cb);
      };
      BackgroundGeolocation2.onConnectivityChange = function(cb) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.ConnectivityChange, cb);
      };
      BackgroundGeolocation2.onPowerSaveChange = function(cb) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.PowerSaveChange, cb);
      };
      BackgroundGeolocation2.onNotificationAction = function(cb) {
        return BackgroundGeolocation2.addListener("notificationaction", cb);
      };
      BackgroundGeolocation2.onAuthorization = function(cb) {
        return BackgroundGeolocation2.addListener(import_background_geolocation_types.Event.Authorization, cb);
      };
      BackgroundGeolocation2.addListener = function(event, success, failure) {
        var handler = function(response) {
          if (response.hasOwnProperty("value")) {
            response = response.value;
          }
          if (response.hasOwnProperty("error") && response.error != null) {
            if (typeof failure === "function") {
              failure(response.error);
            } else {
              success(response);
            }
          } else {
            success(response);
          }
        };
        var isRemoved = false;
        var subscriptionProxy = {
          remove: function() {
            isRemoved = true;
            console.warn("[BackgroundGeolocation.addListener] Unexpected call to subscription.remove() on subscriptionProxy.  Waiting for NativeModule.addListener to resolve.");
          }
        };
        NativeModule.addListener(event, handler).then(function(listener) {
          var subscription = new Subscription(event, listener, success);
          EVENT_SUBSCRIPTIONS.push(subscription);
          subscriptionProxy.remove = function() {
            listener.remove();
            if (EVENT_SUBSCRIPTIONS.indexOf(subscription) >= 0) {
              EVENT_SUBSCRIPTIONS.splice(EVENT_SUBSCRIPTIONS.indexOf(subscription), 1);
            }
          };
          if (isRemoved) {
            subscriptionProxy.remove();
          }
        });
        return subscriptionProxy;
      };
      BackgroundGeolocation2.removeListener = function(event, callback) {
        console.warn("BackgroundGeolocation.removeListener is deprecated.  Event-listener methods (eg: onLocation) now return a Subscription instance.  Call subscription.remove() on the returned subscription instead.  Eg:\nconst subscription = BackgroundGeolocation.onLocation(myLocationHandler)\n...\nsubscription.remove()");
        return new Promise(function(resolve, reject) {
          var found = null;
          for (var n = 0, len = EVENT_SUBSCRIPTIONS.length; n < len; n++) {
            var sub = EVENT_SUBSCRIPTIONS[n];
            if (sub.event === event && sub.callback === callback) {
              found = sub;
              break;
            }
          }
          if (found !== null) {
            EVENT_SUBSCRIPTIONS.splice(EVENT_SUBSCRIPTIONS.indexOf(found), 1);
            found.subscription.remove();
            resolve();
          } else {
            console.warn(TAG + " Failed to find listener for event " + event);
            reject();
          }
        });
      };
      BackgroundGeolocation2.removeListeners = function() {
        var _this = this;
        return new Promise(function(resolve) {
          return __awaiter(_this, void 0, void 0, function() {
            return __generator(this, function(_a) {
              switch (_a.label) {
                case 0:
                  EVENT_SUBSCRIPTIONS = [];
                  return [4, NativeModule.removeAllEventListeners()];
                case 1:
                  _a.sent();
                  resolve();
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        });
      };
      return BackgroundGeolocation2;
    })()
  );
  var index_default = BackgroundGeolocation;
  return __toCommonJS(index_exports);
})();
/*! Bundled license information:

@capacitor/core/dist/index.js:
  (*! Capacitor: https://capacitorjs.com/ - MIT License *)
*/
