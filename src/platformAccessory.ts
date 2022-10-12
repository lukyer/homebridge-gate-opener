import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
  Nullable,
} from 'homebridge';

import { ExampleHomebridgePlatform } from './platform';

import got from 'got';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class ExamplePlatformAccessory {
  private service: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  // private exampleStates = {
  //   On: false,
  //   Brightness: 100,
  // };

  private prevState: Nullable<CharacteristicValue> = null;
  private refreshIntervalMs = 1000;
  private statusUrl: string;
  private toggleUrl: string;
  private bearerToken: string;
  private authHeaders = {};
  private autoCloseSec = 600;

  private stateUpdatedMs = 0; // epoch
  private fixer = 0;
  private autoCloseTimeout;

  constructor(
    private readonly platform: ExampleHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    this.autoCloseSec = this.platform.config.autoCloseSec || this.autoCloseSec;
    this.refreshIntervalMs = this.platform.config.refreshIntervalMs || this.refreshIntervalMs;
    this.statusUrl = this.platform.config.statusUrl || '';
    this.toggleUrl = this.platform.config.toggleUrl || '';
    this.bearerToken = this.platform.config.bearerToken || '';

    this.platform.log.info('Config: %d %s %s %d', this.refreshIntervalMs, this.statusUrl, this.toggleUrl, this.bearerToken.length);

    if (this.platform.config.bearerToken !== undefined) {
      this.authHeaders = {
        headers: {
          'Authorization': 'Bearer ' + this.platform.config.bearerToken,
        },
      };
    }

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.GarageDoorOpener) ||
                   this.accessory.addService(this.platform.Service.GarageDoorOpener);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.exampleDisplayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    // this.service.getCharacteristic(this.platform.Characteristic.On)
    //   .onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
    //   .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below

    // register handlers for the Brightness Characteristic
    // this.service.getCharacteristic(this.platform.Characteristic.Brightness)
    //   .onSet(this.setBrightness.bind(this));       // SET - bind to the 'setBrightness` method below

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentDoorState)
      .on('get', this.handleGetCurrentDoorState);

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetDoorState)
      .on('set', this.handleSetTargetDoorState);

    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */

    // Example: add two "motion sensor" services to the accessory
    // const motionSensorOneService = this.accessory.getService('Motion Sensor One Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1');

    // const motionSensorTwoService = this.accessory.getService('Motion Sensor Two Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2');

    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */
    // let motionDetected = false;
    // setInterval(() => {
    //   // EXAMPLE - inverse the trigger
    //   motionDetected = !motionDetected;
    //
    //   // push the new value to HomeKit
    //   motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);
    //   motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected);
    //
    //   this.platform.log.debug('Triggering motionSensorOneService:', motionDetected);
    //   this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected);
    // }, 10000);

    var that = this;
    const fn = async () => {
      // await this.handleGetCurrentDoorState((_, value) => {
      //   if (value !== null && value !== undefined) {
      //     // prevState: at se neprepisuje OPENING a CLOSING (automaticky nastavuje homekit) kdyz se jeste nezmenil stav cidla
      //     if (this.prevState === null || this.prevState !== value) {
      //       this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState, value);
      //       this.service.updateCharacteristic(this.platform.Characteristic.TargetDoorState, value);
      //       this.prevState = value;
      //     }
      //   }
      // });

      try {
        // const { body } = await this.send(this.endpoints.getState);
        const { body } = await got.get(that.statusUrl);
        // const state = this.applyMappers(body);
        let state = that.platform.Characteristic.CurrentDoorState.CLOSED;
        if (body === 'open') {
          // await new Promise(f => setTimeout(f, 30000));
          state = that.platform.Characteristic.CurrentDoorState.OPEN;
        } else if (body === 'close') {
          state = that.platform.Characteristic.CurrentDoorState.CLOSED;
        } else {
          that.platform.log.error('Got WRONG accessory state %s (%s)', state, body);
        }
        that.platform.log.debug('Got accessory state %s (%s)', state, body);
        // callback(null, state);
        if (that.prevState === null || that.prevState !== state) {
          that.service.updateCharacteristic(that.platform.Characteristic.CurrentDoorState, state);
          that.service.updateCharacteristic(that.platform.Characteristic.TargetDoorState, state);
          that.prevState = state;
          that.stateUpdatedMs = Date.now();
          that.fixer = 0; // reset
          if (that.autoCloseTimeout !== undefined) {
            clearTimeout(that.autoCloseTimeout);
            that.platform.log.debug('Auto close timer cleared', state, body);
          }
          if (state === that.platform.Characteristic.CurrentDoorState.OPEN) {
            that.platform.log.debug('Auto close timer set', state, body);
            that.autoCloseTimeout = setTimeout(async () => {
              await got.post(that.toggleUrl, {
                ...that.authHeaders,
              });
              that.platform.log.debug('Auto close timer ticked', state, body);
            }, that.autoCloseSec * 1000);
          }
        }
        setTimeout(fn, this.refreshIntervalMs);
      } catch (err) {
        setTimeout(fn, this.refreshIntervalMs);
        return that.handleError(err as Error);
      }

      // this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected);
    };
    setTimeout(fn, this.refreshIntervalMs);
  }

  handleError(err: Error, callback?) {
    this.platform.log.error(err.message);
    callback && callback(err);
  }

  // https://github.com/nicinabox/homebridge-http-entry/blob/master/src/accessory.ts
  handleGetCurrentDoorState = async (callback: CharacteristicGetCallback) => {
    // if (!this.endpoints.getState) {
    //   return callback(null);
    // }

    // try {
    //   // const { body } = await this.send(this.endpoints.getState);
    //   const { body } = await got.get(this.statusUrl);
    //   // const state = this.applyMappers(body);
    //   let state = this.platform.Characteristic.CurrentDoorState.CLOSED;
    //   if (body === 'open') {
    //     state = this.platform.Characteristic.CurrentDoorState.OPEN;
    //   } else if (body === 'close') {
    //     state = this.platform.Characteristic.CurrentDoorState.CLOSED;
    //   } else {
    //     this.platform.log.error('Got WRONG accessory state %s (%s)', state, body);
    //   }
    //   this.platform.log.debug('Got accessory state %s (%s)', state, body);
    //   callback(null, state);
    // } catch (err) {
    //   return this.handleError(err as Error, callback);
    // }
    callback(null, this.prevState);
  };

  handleSetTargetDoorState = async (
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) => {
    try {
      if (value === this.platform.Characteristic.TargetDoorState.OPEN || value === this.platform.Characteristic.TargetDoorState.CLOSED) {
        const diffMs = Date.now() - this.stateUpdatedMs;
        if ((this.prevState === value && diffMs > 30*1000 && value === this.platform.Characteristic.TargetDoorState.OPEN) ||
            (this.prevState === value && value === this.platform.Characteristic.TargetDoorState.CLOSED)) {
          // do not toggle gate e.g. if you want open when is already opened
          // but only after 30s when wanting OPEN = if you want e.g. to suddenly change direction when accidentally opened
          this.platform.log.debug('Set target skip already set value %s. DiffMs:', value, diffMs);
        } else {
          await got.post(this.toggleUrl, {
            ...this.authHeaders,
          });
          // this.platform.log.debug('Waiting for sensor confirmation of %s ...', value);
          //
          // do {
          //   await new Promise(f => setTimeout(f, 100));
          //   this.platform.log.debug('Nope ...  %s !== %s ...', this.prevState, value);
          // } while (this.prevState !== value);


        // if (value === this.platform.Characteristic.TargetDoorState.OPEN) {
        //   let tmp = this.service.getCharacteristic(this.platform.Characteristic.TargetDoorState).;
        //   this.platform.log.info("HERE %s", tmp);

          // if (tmp === this.platform.Characteristic.CurrentDoorState.CLOSING) {
            // this.service.updateCharacteristic(this.platform.Characteristic.CurrentDoorState, this.platform.Characteristic.CurrentDoorState.CLOSING);
            // this.service.updateCharacteristic(this.platform.Characteristic.TargetDoorState, this.platform.Characteristic.TargetDoorState.CLOSED);
          // }
        // }

          this.platform.log.debug('Set accessory state %s', value);
        }
      } else {
        this.platform.log.error('Set target WRONG value %s', value);
      }

      callback(null);
      if (this.prevState === this.platform.Characteristic.CurrentDoorState.OPEN) {
        const diffMs = Date.now() - this.stateUpdatedMs;
        if (value === this.platform.Characteristic.TargetDoorState.OPEN && diffMs <= 30*1000) {
          if (this.fixer % 2 === 0) {
            this.service.updateCharacteristic(this.platform.Characteristic.TargetDoorState, this.platform.Characteristic.TargetDoorState.CLOSED);
            this.fixer++;
          } else {
            this.service.updateCharacteristic(this.platform.Characteristic.TargetDoorState, this.platform.Characteristic.TargetDoorState.OPEN);
            this.fixer++;
          }
        }
      }

    } catch (err) {
      return this.handleError(err as Error, callback);
    }
  };

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  // async setOn(value: CharacteristicValue) {
  //   // implement your own code to turn your device on/off
  //   this.exampleStates.On = value as boolean;
  //
  //   this.platform.log.debug('Set Characteristic On ->', value);
  // }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  // async getOn(): Promise<CharacteristicValue> {
  //   // implement your own code to check if the device is on
  //   const isOn = this.exampleStates.On;
  //
  //   this.platform.log.debug('Get Characteristic On ->', isOn);
  //
  //   // if you need to return an error to show the device as "Not Responding" in the Home app:
  //   // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  //
  //   return isOn;
  // }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the Brightness
   */
  // async setBrightness(value: CharacteristicValue) {
  //   // implement your own code to set the brightness
  //   this.exampleStates.Brightness = value as number;
  //
  //   this.platform.log.debug('Set Characteristic Brightness -> ', value);
  // }

}
