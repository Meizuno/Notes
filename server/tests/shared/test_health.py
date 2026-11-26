import pytest

pytestmark = pytest.mark.usefixtures("pool")


async def test_both_probes_answer_ok(make_client, tmp_path):
    client = await make_client(NOTES_DRAIN_FILE=str(tmp_path / "drain"))
    assert (await client.get("/health")).text == "ok"
    assert (await client.get("/api/health")).json() == {"status": "ok"}
    assert (await client.head("/health")).status_code == 200
    assert (await client.head("/api/health")).status_code == 200


async def test_both_answer_503_while_the_drain_file_exists(make_client, tmp_path):
    drain = tmp_path / "drain"
    drain.touch()
    client = await make_client(NOTES_DRAIN_FILE=str(drain))
    health = await client.get("/health")
    api_health = await client.get("/api/health")
    assert (health.status_code, health.text) == (503, "draining")
    assert (api_health.status_code, api_health.json()) == (503, {"status": "draining"})
    drain.unlink()
    assert (await client.get("/api/health")).status_code == 200


async def test_probes_need_no_session_and_touch_nothing(make_client, tmp_path):
    client = await make_client(NOTES_DRAIN_FILE=str(tmp_path / "drain"))
    client.cookies.set("notes_access", "garbage")
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert "set-cookie" not in response.headers
