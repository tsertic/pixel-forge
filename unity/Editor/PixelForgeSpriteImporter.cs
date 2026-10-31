// Pixel Forge managed Unity bridge v1
// Only PNGs with a matching *.pixelforge.json sidecar are managed by this bridge.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;
using UnityEditor;
using UnityEngine;

namespace PixelForgeBridge
{
    public sealed class PixelForgeSpriteImporter : AssetPostprocessor
    {
        [Serializable]
        private sealed class Settings
        {
            public string generator = null;
            public int version = 0;
            public string engine = null;
            public int pixelsPerUnit = 32;
        }

        private void OnPreprocessTexture()
        {
            string marker = Path.ChangeExtension(assetPath, ".pixelforge.json");
            if (!File.Exists(marker)) return;
            try
            {
                Settings settings = JsonUtility.FromJson<Settings>(File.ReadAllText(marker));
                if (settings == null || settings.generator != "pixel-forge" || settings.version != 1) return;
                if (!String.IsNullOrEmpty(settings.engine) && settings.engine != "unity") return;
                TextureImporter importer = (TextureImporter)assetImporter;
                importer.textureType = TextureImporterType.Sprite;
                importer.spriteImportMode = SpriteImportMode.Single;
                importer.filterMode = FilterMode.Point;
                importer.textureCompression = TextureImporterCompression.Uncompressed;
                importer.mipmapEnabled = false;
                importer.npotScale = TextureImporterNPOTScale.None;
                importer.wrapMode = TextureWrapMode.Clamp;
                importer.alphaIsTransparency = true;
                importer.spritePixelsPerUnit = Mathf.Clamp(settings.pixelsPerUnit, 1, 1000);
            }
            catch (Exception error)
            {
                Debug.LogWarning("Pixel Forge could not read " + marker + ": " + error.Message);
            }
        }

        public override uint GetVersion() { return 1; }

        // Import changed managed PNGs while the editor is running, including when Auto Refresh is off.
        // The first installation still needs Unity to compile this script (focus Unity or Assets > Refresh).
        [InitializeOnLoadMethod]
        private static void Initialize()
        {
            EditorApplication.update -= Poll;
            EditorApplication.update += Poll;
        }

        private static readonly Dictionary<string, string> Seen = new Dictionary<string, string>();
        private static double nextPoll;
        private static string ScriptFile([CallerFilePath] string file = "") { return file; }

        private static void Poll()
        {
            if (EditorApplication.timeSinceStartup < nextPoll || EditorApplication.isCompiling || EditorApplication.isUpdating) return;
            nextPoll = EditorApplication.timeSinceStartup + 1.0;
            string editorFolder = Path.GetDirectoryName(ScriptFile());
            string folder = Path.GetDirectoryName(editorFolder);
            if (String.IsNullOrEmpty(folder) || !Directory.Exists(folder)) return;
            try
            {
                string assets = Path.GetFullPath(Application.dataPath).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                foreach (string marker in Directory.GetFiles(folder, "*.pixelforge.json", SearchOption.TopDirectoryOnly))
                {
                    string png = marker.Substring(0, marker.Length - ".pixelforge.json".Length) + ".png";
                    string full = Path.GetFullPath(png);
                    if (!File.Exists(full) || !full.StartsWith(assets, StringComparison.OrdinalIgnoreCase)) continue;
                    FileInfo pngInfo = new FileInfo(full), markerInfo = new FileInfo(marker);
                    string signature = pngInfo.LastWriteTimeUtc.Ticks + ":" + pngInfo.Length + ":" + markerInfo.LastWriteTimeUtc.Ticks;
                    string previous;
                    if (Seen.TryGetValue(full, out previous) && previous == signature) continue;
                    string asset = "Assets/" + full.Substring(assets.Length).Replace('\\', '/');
                    AssetDatabase.ImportAsset(asset, ImportAssetOptions.ForceUpdate);
                    Seen[full] = signature;
                }
            }
            catch (IOException) { /* A save can overlap a poll. Retry on the next update. */ }
            catch (UnauthorizedAccessException) { /* Leave inaccessible files alone. */ }
        }
    }
}
