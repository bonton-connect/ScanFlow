import React, { useState, useEffect, useCallback, useMemo } from "react";
import { URL } from "react-native-url-polyfill";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";

import {
  Text,
  View,
  StyleSheet,
  BackHandler,
  Vibration,
  ActivityIndicator,
} from "react-native";

import {
  BarCodeScanner,
  PermissionStatus,
  BarCodeScannedCallback,
} from "expo-barcode-scanner";

import WebView, {
  WebViewMessageEvent,
  WebViewNavigation,
} from "react-native-webview";

import { Picker } from "@react-native-picker/picker";

let lastDetection = 0;

export default function App() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [detectionData, setDetectionData] = useState("");
  const [activity, setActivity] = useState(0);
  const [config, setConfig] = useState<null | {
    t: "_bc2w-conf";
    a: {
      // activities
      n: string; // name
      u: string; // url
      p?: string; // param name
      r?: string; // regex
      rf?: string; // regex-flags
      t?: "wv" | "n"; // target
    }[];
  }>(null);

  useEffect(() => {
    console.log(config);
  }, [config]);

  useEffect(() => {
    (async () => {
      try {
        const raw = (await SecureStore.getItemAsync("config")) || "{}";
        const parsed = JSON.parse(raw);

        setConfig(parsed);
      } catch (error) {
        console.error("COULD NOT RETRIEVE CONFIG FROM SECURE STORE", error);
      }
    })();
  }, [setConfig]);

  const configLoaded = config && config.a && config.a.length > 0;

  const regex = useMemo(() => {
    if (configLoaded) {
      return new RegExp(
        config?.a?.[activity]?.r || "^.*$",
        config?.a?.[activity]?.rf || "g"
      );
    }

    return null;
  }, [activity, config]);

  const target = (configLoaded && config?.a[activity].t) || "wv";

  const url = (configLoaded && config?.a[activity].u) || "";
  const paramName = (configLoaded && config?.a[activity].p) || "data";

  const makeURL = useCallback(
    (data: string) => {
      if (url) {
        const u = new URL(url);
        u.searchParams.append(paramName, encodeURIComponent(data));

        return u.toString();
      }

      return null;
    },
    [url, paramName]
  );

  useEffect(() => {
    const getBarCodeScannerPermissions = async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === PermissionStatus.GRANTED);
    };

    getBarCodeScannerPermissions();
  }, []);

  const handleBarCodeScanned: BarCodeScannedCallback = useCallback(
    async ({ type, data }) => {
      if (Date.now() - lastDetection < 5000) {
        return;
      }

      try {
        const d = JSON.parse(data);

        if (d?.t === "_bc2w-conf") {
          Vibration.vibrate(500);

          setConfig(d);
          await SecureStore.setItemAsync("config", JSON.stringify(d));

          lastDetection = Date.now();
          return;
        }
      } catch {}

      if (!regex) {
        console.log("NO REGEX");
        return;
      }

      const isDetection = regex.test(data);

      if (!isDetection) {
        console.log("DETECTION FORMAT MISMATCH", data);
        return;
      } else {
        lastDetection = Date.now();
      }

      Vibration.vibrate(100);

      console.log("LAUNCHING FOR", data);

      if (target === "wv") {
        setDetectionData(data);
      } else {
        const u = makeURL(data);

        if (u) {
          await Linking.openURL(u);
        }
      }
    },
    [setDetectionData, regex, target, makeURL]
  );

  const back = useCallback(() => {
    if (detectionData) {
      setDetectionData("");
    } else {
      BackHandler.exitApp();
    }

    return true;
  }, [detectionData]);

  useEffect(() => {
    BackHandler.addEventListener("hardwareBackPress", back);

    return () => {
      BackHandler.removeEventListener("hardwareBackPress", back);
    };
  }, [back]);

  const handleNavChange = useCallback(
    (ev: WebViewNavigation) => {
      console.log("NAV CHANGE", ev);

      if (ev.url.indexOf("barcodetoweb_close_cmd") >= 0) {
        console.log("CLOSING DUE TO URL");
        setDetectionData("");
      }
    },
    [setDetectionData]
  );

  const handleMessage = useCallback(
    (ev: WebViewMessageEvent) => {
      console.log("CLOSING DUE TO MESSAGE");
      console.log(ev);
    },
    [setDetectionData]
  );

  const handleActivityChange = useCallback(
    (val: any, i: number) => {
      setActivity(i);
    },
    [setActivity]
  );

  return (
    <View style={styles.container}>
      {hasPermission === null ? (
        <Text>REQUESTING CAMERA PERMISSIONS</Text>
      ) : hasPermission === false ? (
        <Text>NO ACCESS TO CAMERA</Text>
      ) : (
        <>
          {detectionData ? (
            <View style={styles.container}>
              <WebView
                style={StyleSheet.absoluteFillObject}
                source={{
                  uri: makeURL(detectionData) || "https://example.com",
                }}
                onNavigationStateChange={handleNavChange}
                onMessage={handleMessage}
              />
            </View>
          ) : (
            <>
              <BarCodeScanner
                onBarCodeScanned={handleBarCodeScanned}
                style={styles.scanner}
              />
              {configLoaded ? (
                <Picker
                  style={styles.picker}
                  selectedValue={activity}
                  onValueChange={handleActivityChange}
                >
                  {config?.a.map((activity, i) => {
                    return <Picker.Item key={i} value={i} label={activity.n} />;
                  })}
                </Picker>
              ) : (
                <Text style={styles.config_message}>
                  Please Scan a Config QR Code
                </Text>
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    backgroundColor: "black",
  },
  config_message: {
    color: "white",
    textAlign: "center",
    textTransform: "uppercase",
  },
  scanner: {
    width: "100%",
    height: "90%",
  },
  picker: {
    color: "white",
    backgroundColor: "#0e0b6b",
  },
});
