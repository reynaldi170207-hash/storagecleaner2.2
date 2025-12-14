import os, json, sys
from pathlib import Path
import time
from datetime import datetime

DELETE_FILE = "delete_request.json"
LOG_FILE = "cleaner_log.json"

def clean_files():
    """Hapus file berdasarkan delete_request.json"""
    delete_path = Path.cwd() / DELETE_FILE
    log_entries = []
    
    if not delete_path.exists():
        print(f"ERROR: {DELETE_FILE} tidak ditemukan!")
        print("Pastikan Anda telah memilih file di website dan mengklik 'Clean Selected Files'")
        return
    
    try:
        with open(delete_path, "r", encoding='utf-8') as f:
            delete_list = json.load(f)
    except Exception as e:
        print(f"ERROR: Gagal membaca {DELETE_FILE}: {e}")
        return
    
    if not isinstance(delete_list, list):
        print(f"ERROR: Format {DELETE_FILE} tidak valid!")
        return
    
    print(f"=== My Storage Cleaner ===")
    print(f"Jumlah file yang akan dihapus: {len(delete_list)}")
    print(f"Waktu: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("-" * 50)
    
    total_success = 0
    total_failed = 0
    total_size_freed = 0
    
    for i, file_path in enumerate(delete_list, 1):
        try:
            if not os.path.exists(file_path):
                print(f"[{i}/{len(delete_list)}] File tidak ditemukan: {file_path}")
                log_entries.append({
                    "file": file_path,
                    "status": "not_found",
                    "error": "File tidak ditemukan"
                })
                total_failed += 1
                continue
            
            # Dapatkan ukuran file sebelum dihapus
            file_size = os.path.getsize(file_path)
            
            # Hapus file
            os.remove(file_path)
            
            # Verifikasi file sudah terhapus
            if os.path.exists(file_path):
                print(f"[{i}/{len(delete_list)}] GAGAL menghapus: {file_path}")
                log_entries.append({
                    "file": file_path,
                    "size": file_size,
                    "status": "failed",
                    "error": "Masih ada setelah remove"
                })
                total_failed += 1
            else:
                print(f"[{i}/{len(delete_list)}] BERHASIL: {file_path} ({file_size:,} bytes)")
                log_entries.append({
                    "file": file_path,
                    "size": file_size,
                    "status": "success"
                })
                total_success += 1
                total_size_freed += file_size
                
        except PermissionError:
            print(f"[{i}/{len(delete_list)}] GAGAL (Permission Denied): {file_path}")
            log_entries.append({
                "file": file_path,
                "status": "failed",
                "error": "Permission denied"
            })
            total_failed += 1
        except Exception as e:
            print(f"[{i}/{len(delete_list)}] GAGAL: {file_path} - Error: {e}")
            log_entries.append({
                "file": file_path,
                "status": "failed",
                "error": str(e)
            })
            total_failed += 1
        
        # Beri jeda kecil agar tidak terlalu membebani sistem
        if i % 10 == 0:
            time.sleep(0.1)
    
    print("-" * 50)
    print(f"=== SUMMARY ===")
    print(f"Total berhasil: {total_success} file")
    print(f"Total gagal: {total_failed} file")
    print(f"Total space freed: {total_size_freed:,} bytes ({total_size_freed / (1024*1024):.2f} MB)")
    
    # Simpan log
    log_path = Path.cwd() / LOG_FILE
    try:
        with open(log_path, "w", encoding='utf-8') as f:
            json.dump({
                "cleanup_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "total_files": len(delete_list),
                "success": total_success,
                "failed": total_failed,
                "size_freed": total_size_freed,
                "entries": log_entries
            }, f, indent=4, ensure_ascii=False)
        print(f"\nLog disimpan di: {log_path}")
    except Exception as e:
        print(f"Gagal menyimpan log: {e}")
    
    # Backup delete_request.json sebelum dihapus
    backup_path = Path.cwd() / f"delete_request_backup_{int(time.time())}.json"
    try:
        import shutil
        shutil.copy2(delete_path, backup_path)
        print(f"Backup delete_request disimpan di: {backup_path}")
    except:
        pass
    
    # Hapus delete_request.json setelah selesai
    try:
        os.remove(delete_path)
        print(f"{DELETE_FILE} telah dihapus")
    except:
        pass
    
    input("\nTekan Enter untuk keluar...")

if __name__ == "__main__":
    clean_files()