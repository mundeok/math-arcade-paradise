from pathlib import Path
import qrcode

url = 'http://172.30.1.60:8125/?v=chain-polish'
out = Path(__file__).resolve().parents[1] / 'test-output/mobile-qr.png'
out.parent.mkdir(parents=True, exist_ok=True)
qr = qrcode.QRCode(box_size=10, border=4)
qr.add_data(url)
qr.make(fit=True)
qr.make_image(fill_color='black', back_color='white').save(out)
print(out)
