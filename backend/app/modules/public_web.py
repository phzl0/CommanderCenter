"""Bounded public HTTPS reads with DNS validation and IP-pinned TLS connections."""

import http.client
import ipaddress
import socket
import ssl
import time
from urllib.parse import urlparse, urljoin
from app.modules.providers import ProviderError


def validate_url(url):
    try:
        parsed = urlparse(url)
        if (
            len(url) > 2048
            or parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username is not None
            or parsed.port not in (None, 443)
            or parsed.fragment
        ):
            raise ValueError()
        host = parsed.hostname.encode("idna").decode("ascii")
        if host.lower() in (
            "localhost",
            "localhost.localdomain",
        ) or host.lower().endswith((".localhost", ".local", ".internal")):
            raise ValueError()
        try:
            if not ipaddress.ip_address(host).is_global:
                raise ValueError()
        except ValueError as e:
            # A hostname is allowed here; an invalid/private numeric address is not.
            if ":" in host or host.replace(".", "").isdigit():
                raise e
        return parsed, host
    except Exception:
        raise ProviderError(
            "Use um endereço HTTPS público, sem credenciais, porta alternativa ou fragmento."
        )


def resolve_public(host):
    try:
        addresses = list(
            dict.fromkeys(
                info[4][0]
                for info in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
            )
        )
        if not addresses or any(
            not ipaddress.ip_address(ip).is_global for ip in addresses
        ):
            raise ValueError()
        return addresses
    except Exception:
        raise ProviderError(
            "O endereço não resolve exclusivamente para uma rede pública permitida."
        )


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, ip, timeout):
        super().__init__(host, timeout=timeout, context=ssl.create_default_context())
        self.resolved_ip = ip

    def connect(self):
        raw = socket.create_connection((self.resolved_ip, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


def public_fetch(url, max_bytes=2 * 1024 * 1024):
    deadline = time.monotonic() + 18
    try:
        for _ in range(4):
            parsed, host = validate_url(url)
            addresses = resolve_public(host)
            conn = PinnedHTTPS(
                host,
                addresses[0],
                timeout=max(0.1, min(8, deadline - time.monotonic())),
            )
            try:
                path = parsed.path or "/"
                if parsed.query:
                    path += "?" + parsed.query
                conn.request(
                    "GET",
                    path,
                    headers={
                        "User-Agent": "CommandCenter/0.3 RSS Reader",
                        "Accept": "application/rss+xml, application/atom+xml, text/html, image/*;q=0.8",
                        "Accept-Encoding": "identity",
                    },
                )
                response = conn.getresponse()
                if response.status in (301, 302, 303, 307, 308):
                    location = response.getheader("Location")
                    if not location:
                        raise ProviderError("Redirecionamento inválido da fonte.")
                    url = urljoin(url, location)
                    continue
                if response.status != 200:
                    raise ProviderError(
                        "A fonte não respondeu com sucesso. Confira o link e tente mais tarde."
                    )
                if response.getheader("Content-Encoding", "identity").lower() not in (
                    "",
                    "identity",
                ):
                    raise ProviderError(
                        "A fonte exige uma codificação não suportada neste leitor."
                    )
                result = bytearray()
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise ProviderError("A fonte demorou demais para responder.")
                    if conn.sock:
                        conn.sock.settimeout(min(8, remaining))
                    chunk = response.read(min(65536, max_bytes + 1 - len(result)))
                    if not chunk:
                        break
                    result.extend(chunk)
                    if len(result) > max_bytes:
                        raise ProviderError(
                            "A resposta da fonte excedeu o limite permitido."
                        )
                return bytes(result), response.getheader("Content-Type", ""), url
            finally:
                conn.close()
        raise ProviderError("A fonte redirecionou muitas vezes.")
    except ProviderError:
        raise
    except Exception:
        raise ProviderError(
            "Não foi possível consultar esse endereço público. Verifique a conexão ou tente outro RSS."
        )
