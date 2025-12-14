import os, json, shutil, time, sys
from pathlib import Path
import string
from datetime import datetime
import hashlib
from collections import defaultdict

HISTORY_FILE = "storage_history.json"
CONFIG_FILE = "scan_config.json"
PROGRESS_FILE = "scan_progress.json"

def update_progress(stage, progress, message=""):
    """Update progress untuk real-time tracking"""
    progress_data = {
        "stage": stage,
        "progress": min(100, max(0, progress)),
        "message": message,
        "timestamp": time.time()
    }
    
    try:
        with open(PROGRESS_FILE, "w") as f:
            json.dump(progress_data, f)
    except:
        pass

def get_available_drives():
    """Mendapatkan semua drive yang tersedia di Windows"""
    drives = []
    for letter in string.ascii_uppercase:
        path = f"{letter}:\\"
        if os.path.exists(path):
            drives.append(path)
    return drives

def load_config():
    """Load konfigurasi scan dari JSON"""
    config_path = Path.cwd() / CONFIG_FILE
    if config_path.exists():
        try:
            with open(config_path, "r") as f:
                config = json.load(f)
            return config
        except Exception as e:
            print(f"Error loading config: {e}")
    
    # Default config
    user = str(Path.home())
    config = {
        "scan_config": {
            "drives": ["C:"],
            "custom_folders": [],
            "scan_all_drives": False,
            "scan_options": {
                "large_files_threshold_mb": 100,
                "include_temp": True,
                "include_logs": True,
                "scan_downloads": True,
                "scan_documents": True,
                "scan_root": False,
                "find_duplicates": True,
                "min_duplicate_size_kb": 100,
                "duplicate_file_types": ["image", "document", "video", "audio", "archive"]
            }
        }
    }
    return config

def calculate_file_hash(file_path, chunk_size=8192):
    """Calculate MD5 hash of a file with progress awareness"""
    hash_md5 = hashlib.md5()
    try:
        file_size = os.path.getsize(file_path)
        bytes_read = 0
        
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(chunk_size), b""):
                hash_md5.update(chunk)
                bytes_read += len(chunk)
                
                # Update progress setiap 1MB
                if bytes_read % (1024*1024) == 0:
                    update_progress("hashing", (bytes_read / file_size) * 100 if file_size > 0 else 0, 
                                  f"Hashing: {os.path.basename(file_path)}")
                    
        return hash_md5.hexdigest()
    except:
        return None

def find_duplicate_files(scan_paths, min_size_kb=100, file_types=None):
    """Find duplicate files based on hash with progress tracking"""
    print("🔍 Scanning for duplicate files...")
    update_progress("duplicates", 0, "Starting duplicate scan...")
    
    # File type filter
    file_type_extensions = {
        "image": ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'],
        "document": ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf'],
        "video": ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm', '.m4v'],
        "audio": ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma'],
        "archive": ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2']
    }
    
    allowed_extensions = []
    if file_types and file_types != ["all"]:
        for ft in file_types:
            if ft in file_type_extensions:
                allowed_extensions.extend(file_type_extensions[ft])
    
    # Phase 1: Collect files and group by size
    update_progress("duplicates", 10, "Collecting files...")
    size_dict = defaultdict(list)
    total_files = 0
    files_scanned = 0
    
    for scan_path in scan_paths:
        if not os.path.exists(scan_path):
            continue
            
        if os.path.isfile(scan_path):
            # Single file
            try:
                size = os.path.getsize(scan_path)
                if size >= min_size_kb * 1024:
                    ext = os.path.splitext(scan_path)[1].lower()
                    if not allowed_extensions or ext in allowed_extensions:
                        size_dict[size].append(scan_path)
                        total_files += 1
            except:
                continue
        else:
            # Directory
            for root, dirs, files in os.walk(scan_path):
                for file in files:
                    try:
                        file_path = os.path.join(root, file)
                        size = os.path.getsize(file_path)
                        
                        if size < min_size_kb * 1024:
                            continue
                            
                        ext = os.path.splitext(file_path)[1].lower()
                        if allowed_extensions and ext not in allowed_extensions:
                            continue
                            
                        size_dict[size].append(file_path)
                        total_files += 1
                        
                        # Update progress setiap 100 file
                        files_scanned += 1
                        if files_scanned % 100 == 0:
                            update_progress("duplicates", 10 + (files_scanned / total_files * 30) if total_files > 0 else 20,
                                          f"Found {files_scanned} files...")
                    except:
                        continue
    
    print(f"📊 Found {total_files} files to check for duplicates")
    
    # Phase 2: Check files with same size
    update_progress("duplicates", 40, "Identifying potential duplicates...")
    potential_duplicates = []
    
    for size, files in size_dict.items():
        if len(files) > 1:
            potential_duplicates.extend(files)
    
    print(f"🔍 Checking {len(potential_duplicates)} potential duplicates...")
    
    # Phase 3: Calculate hash for potential duplicates
    update_progress("duplicates", 50, "Calculating file hashes...")
    hash_dict = defaultdict(list)
    duplicate_groups = []
    total_wasted_space = 0
    
    for i, file_path in enumerate(potential_duplicates):
        try:
            file_hash = calculate_file_hash(file_path)
            if file_hash:
                file_size = os.path.getsize(file_path)
                modified_time = os.path.getmtime(file_path)
                
                hash_dict[file_hash].append({
                    "path": file_path,
                    "size": file_size,
                    "modified": modified_time,
                    "modified_str": datetime.fromtimestamp(modified_time).strftime("%Y-%m-%d %H:%M:%S")
                })
        except:
            continue
        
        # Update progress
        progress = 50 + (i / len(potential_duplicates) * 40) if potential_duplicates else 90
        update_progress("duplicates", progress, 
                      f"Hashing files... {i+1}/{len(potential_duplicates)}")
    
    # Phase 4: Group duplicates
    update_progress("duplicates", 90, "Grouping duplicates...")
    for file_hash, files in hash_dict.items():
        if len(files) > 1:
            # Sort by modified time (newest first)
            files.sort(key=lambda x: x["modified"], reverse=True)
            
            total_size = sum(f["size"] for f in files)
            wasted_space = total_size - files[0]["size"]  # Keep newest, waste others
            
            duplicate_groups.append({
                "hash": file_hash,
                "files": files,
                "total_size": total_size,
                "wasted_space": wasted_space,
                "count": len(files),
                "file_extension": os.path.splitext(files[0]["path"])[1].lower()
            })
            total_wasted_space += wasted_space
    
    update_progress("duplicates", 100, "Duplicate scan completed!")
    
    return {
        "duplicate_groups": duplicate_groups,
        "total_wasted_space": total_wasted_space,
        "total_duplicate_files": sum(len(g["files"]) for g in duplicate_groups),
        "total_groups": len(duplicate_groups),
        "scanned_files": total_files
    }

def scan_with_config(config):
    """Scan sistem berdasarkan konfigurasi dengan progress tracking"""
    start_time = time.time()
    
    # Reset progress
    update_progress("initializing", 0, "Starting scan...")
    
    scan_config = config.get("scan_config", {})
    options = scan_config.get("scan_options", {})
    
    LARGE_THRESHOLD = options.get("large_files_threshold_mb", 100) * 1024 * 1024
    drives_to_scan = []
    
    # Determine drives to scan
    if scan_config.get("scan_all_drives", False):
        drives_to_scan = get_available_drives()
    else:
        drives_to_scan = scan_config.get("drives", ["C:"])
    
    # Add custom folders
    custom_folders = scan_config.get("custom_folders", [])
    
    # Build scan paths
    scan_paths = []
    for drive in drives_to_scan:
        drive = drive.rstrip('\\')
        user_home = str(Path.home())
        
        # Check if drive is same as user home drive
        if drive[0].upper() == user_home[0].upper():
            if options.get("scan_downloads", True):
                downloads_path = os.path.join(user_home, "Downloads")
                if os.path.exists(downloads_path):
                    scan_paths.append(downloads_path)
            
            if options.get("scan_documents", True):
                documents_path = os.path.join(user_home, "Documents")
                if os.path.exists(documents_path):
                    scan_paths.append(documents_path)
        
        # Scan root drive if enabled
        if options.get("scan_root", False):
            scan_paths.append(drive + "\\")
    
    # Add custom folders
    scan_paths.extend([f for f in custom_folders if os.path.exists(f)])
    
    # Remove duplicates
    scan_paths = list(set(scan_paths))
    
    print(f"📁 Scanning paths: {scan_paths}")
    
    # Initialize results
    large_files = []
    total_size = 0
    junk_files = {"tmp": [], "log": [], "other": []}
    
    # Phase 1: Scan large files
    update_progress("scanning", 20, "Scanning for large files...")
    file_count = 0
    
    for path in scan_paths:
        if not os.path.exists(path):
            continue
        
        try:
            if os.path.isfile(path):
                # Single file
                size = os.path.getsize(path)
                total_size += size
                if size > LARGE_THRESHOLD:
                    large_files.append({
                        "path": path, 
                        "size": size, 
                        "drive": path[0].upper()
                    })
                file_count += 1
            else:
                # Directory
                for root, dirs, files in os.walk(path):
                    for f in files:
                        try:
                            full_path = os.path.join(root, f)
                            size = os.path.getsize(full_path)
                            total_size += size
                            if size > LARGE_THRESHOLD:
                                large_files.append({
                                    "path": full_path, 
                                    "size": size, 
                                    "drive": path[0].upper()
                                })
                            file_count += 1
                            
                            # Update progress setiap 500 files
                            if file_count % 500 == 0:
                                update_progress("scanning", 20 + (file_count / 10000 * 30),
                                              f"Scanned {file_count} files...")
                        except:
                            continue
        except Exception as e:
            print(f"Error scanning {path}: {e}")
    
    # Phase 2: Scan junk files
    update_progress("scanning", 50, "Scanning for junk files...")
    if options.get("include_temp", True) or options.get("include_logs", True):
        JUNK_FOLDERS = []
        user = str(Path.home())
        
        # Temp folder in drive C:
        temp_path = os.path.join(user, "AppData", "Local", "Temp")
        if os.path.exists(temp_path):
            JUNK_FOLDERS.append(temp_path)
        
        # Windows Temp
        windows_temp = "C:\\Windows\\Temp"
        if os.path.exists(windows_temp):
            JUNK_FOLDERS.append(windows_temp)
        
        for folder in JUNK_FOLDERS:
            if not os.path.exists(folder):
                continue
            for root, dirs, files in os.walk(folder):
                for f in files:
                    try:
                        path = os.path.join(root, f)
                        size = os.path.getsize(path)
                        ext = os.path.splitext(f)[1].lower()
                        
                        if ext == ".tmp" and options.get("include_temp", True):
                            junk_files["tmp"].append({"path": path, "size": size, "drive": path[0].upper()})
                        elif ext == ".log" and options.get("include_logs", True):
                            junk_files["log"].append({"path": path, "size": size, "drive": path[0].upper()})
                        elif options.get("include_temp", True):
                            junk_files["other"].append({"path": path, "size": size, "drive": path[0].upper()})
                    except:
                        continue
    
    # Phase 3: Find duplicate files
    duplicate_results = {"duplicate_files": []}
    if options.get("find_duplicates", True):
        update_progress("duplicates", 70, "Looking for duplicate files...")
        duplicate_results = find_duplicate_files(
            scan_paths,
            min_size_kb=options.get("min_duplicate_size_kb", 100),
            file_types=options.get("duplicate_file_types", ["all"])
        )
    
    # Storage info for each drive
    storage_info = {}
    for drive in drives_to_scan:
        drive = drive.rstrip('\\')
        try:
            total, used, free = shutil.disk_usage(drive + "\\")
            storage_info[drive] = {
                "total": total,
                "used": used,
                "free": free,
                "percentage": (used / total) * 100 if total > 0 else 0
            }
        except Exception as e:
            print(f"Error getting disk usage for {drive}: {e}")
            storage_info[drive] = {
                "total": 0,
                "used": 0,
                "free": 0,
                "percentage": 0
            }
    
    # Storage history
    history_path = Path.cwd() / HISTORY_FILE
    history = []
    if history_path.exists():
        try:
            with open(history_path, "r") as f:
                history = json.load(f)
        except:
            history = []
    
    history.append({
        "time": int(time.time()),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_size": total_size,
        "storage_info": storage_info,
        "config": scan_config
    })
    
    # Keep only last 50 scans
    if len(history) > 50:
        history = history[-50:]
    
    try:
        with open(history_path, "w") as f:
            json.dump(history, f, indent=4)
    except:
        pass
    
    scan_time = time.time() - start_time
    
    update_progress("complete", 100, "Scan completed successfully!")
    
    result = {
        "scan_config": scan_config,
        "scan_paths": scan_paths,
        "total_size": total_size,
        "large_files": large_files,
        "junk_files": junk_files,
        "duplicate_files": duplicate_results,
        "storage_info": storage_info,
        "storage_history": history,
        "scan_time_sec": round(scan_time, 2),
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "files_scanned": file_count + sum(len(v) for v in junk_files.values())
    }
    
    # Clean up progress file
    try:
        os.remove(PROGRESS_FILE)
    except:
        pass
    
    return result

def save_scan_result(data):
    output = Path.cwd() / "scan_result.json"
    try:
        with open(output, "w", encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        print(f"✅ Results saved to: {output}")
        
        # Summary
        print(f"\n📊 SCAN SUMMARY:")
        print(f"   Scan time: {data['scan_time_sec']} seconds")
        print(f"   Files scanned: {data['files_scanned']}")
        print(f"   Large files: {len(data['large_files'])}")
        
        total_junk = sum(len(v) for v in data['junk_files'].values())
        print(f"   Junk files: {total_junk}")
        
        if data['duplicate_files'].get('total_groups', 0) > 0:
            print(f"   Duplicate groups: {data['duplicate_files']['total_groups']}")
            print(f"   Duplicate files: {data['duplicate_files']['total_duplicate_files']}")
            print(f"   Wasted space: {data['duplicate_files']['total_wasted_space']:,} bytes")
        
        for drive, info in data['storage_info'].items():
            print(f"   Drive {drive}: {info['used']:,} used, {info['free']:,} free ({info['percentage']:.1f}% used)")
            
    except Exception as e:
        print(f"❌ Error saving results: {e}")

if __name__ == "__main__":
    print("=" * 50)
    print("      MY STORAGE SCANNER v2.0")
    print("      WITH DUPLICATE FINDER")
    print("=" * 50)
    
    try:
        config = load_config()
        print(f"📋 Configuration loaded")
        
        data = scan_with_config(config)
        save_scan_result(data)
        
        print("\n✅ Scan completed successfully!")
        
    except KeyboardInterrupt:
        print("\n⚠️ Scan interrupted by user")
    except Exception as e:
        print(f"\n❌ Error during scan: {e}")
    
    input("\nPress Enter to exit...")